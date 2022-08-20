import axios from 'axios';
import fs from 'fs';
import _path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { camelCase, find, findIndex, forEach, mapKeys, orderBy, remove, zipObject } from 'lodash-es';
import type {
	ApiController,
	ApiData,
	ApiMethod,
	Enum,
	EnumItem,
	Model,
	NswagOptions,
	Parameter,
	Propertie,
	Type,
} from './types';
import https from 'https';
import inquirer from 'inquirer';

/**
 * 获取Swagger的JSON数据
 * @param {*} swaggerUrl
 */
function getSwaggerData(swaggerUrl: string) {
	const agent = new https.Agent({
		rejectUnauthorized: false,
	});
	return new Promise((resolve, reject) => {
		axios.get(swaggerUrl, { httpsAgent: agent }).then((response) => {
			if (response.status == 200) {
				const d = response.data;
				if (typeof d == 'string') {
					const obj = eval('(' + d + ')');
					resolve(obj);
				} else {
					resolve(d);
				}
			} else {
				reject(new Error('获取swagger数据失败'));
			}
		});
	});
}

/**
 * 删除文件夹
 * @param path 地址
 */
function removeDirSync(path: string) {
	let files = [];
	/**
	 * 判断给定的路径是否存在
	 */
	if (fs.existsSync(path)) {
		/**
		 * 返回文件和子目录的数组
		 */
		files = fs.readdirSync(path);
		files.forEach(function (file) {
			const curPath = _path.join(path, file);
			/**
			 * fs.statSync同步读取文件夹文件，如果是文件夹，在重复触发函数
			 */
			if (fs.statSync(curPath).isDirectory()) {
				// recurse
				removeDirSync(curPath);
			} else {
				fs.unlinkSync(curPath);
			}
		});
		/**
		 * 清除文件夹
		 */
		fs.rmdirSync(path);
	} else {
		console.log(`路径[${path}]不存在`);
	}
}

/**
 * 创建目录
 * @param path 目录
 */
function markDirsSync(path: string) {
	try {
		if (!fs.existsSync(path)) {
			let pathtmp = '';
			path.split(/[/\\]/).forEach((dirname) => {
				// 这里指用/ 或\ 都可以分隔目录  如  linux的/usr/local/services   和windows的 d:\temp\aaaa
				if (pathtmp) {
					pathtmp = _path.join(pathtmp, dirname);
				} else {
					pathtmp = dirname || '/';
				}
				if (!fs.existsSync(pathtmp)) {
					fs.mkdirSync(pathtmp);
				}
			});
		}
		return true;
	} catch (e) {
		console.log('创建目录出错', e);
		return false;
	}
}

/**
 * 生成代码
 * @param tplPath 模板绝对地址
 * @param data 数据
 * @param outPath 文件存放绝对地址
 * @param fileName 文件名称
 */
function codeRender(tplPath: string, data: any, outPath: string, fileName: string) {
	if (markDirsSync(outPath)) {
		const fileText = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data);
		const savePath = _path.join(outPath, fileName);
		fs.writeFileSync(savePath, fileText);
	}
}

/**
 * 去掉换行
 * @param str 字符串
 */
function removeLineBreak(str: string) {
	return str ? str.replace(/[\r\n]/g, '') : '';
}

/**
 * 参数名称处理
 * @param {*} oldName
 */
function getParameterName(oldName: string) {
	let newName = oldName;
	// 关键词处理
	if (oldName === 'number') {
		newName = 'num';
	}
	if (oldName === 'string') {
		newName = 'str';
	}
	newName = camelCase(oldName);
	return newName;
}

/**
 * 处理重名问题
 * @param name 当前名称
 * @param list 列表，对象必须有Name属性才行
 */
function reName(name: string, list: Array<any>) {
	// 方法名称-重名处理
	if (findIndex(list, { Name: name }) !== -1) {
		let i = 1;
		while (true) {
			if (findIndex(list, { Name: name + '_' + i }) !== -1) {
				i++;
			} else {
				name = name + '_' + i;
				break;
			}
		}
	}
	return name;
}

/**
 * 格式化属性
 * @param properties 属性
 * @param options 配置
 */
function convertType(properties: any, options: NswagOptions): any {
	let type: Type = {
		TypeOf: 'string',
		TsType: 'void',
		Ref: '',
	};
	if (!properties) {
		return type;
	}
	if (properties.hasOwnProperty('oneOf')) {
		return convertType(properties.oneOf[0], options);
	}
	if (properties.hasOwnProperty('allOf')) {
		return convertType(properties.allOf[0], options);
	}
	if (properties.hasOwnProperty('schema')) {
		return convertType(properties.schema, options);
	}
	if (properties.hasOwnProperty('$ref')) {
		const t = options.FormatModelName(properties.$ref.substring(properties.$ref.lastIndexOf('/') + 1));
		type = {
			TypeOf: 'schema',
			TsType: t,
			Ref: t,
		};
	} else if (properties.hasOwnProperty('enum')) {
		type = {
			TypeOf: 'enum',
			TsType: properties.enum
				.map((item: any) => {
					return JSON.stringify(item);
				})
				.join(' | '),
			Ref: '',
		};
	} else if (properties.type === 'array') {
		const iType = convertType(properties.items, options);
		type = {
			TypeOf: 'array',
			TsType: 'Array<' + iType.TsType + '>',
			Ref: iType.Ref,
		};
	} else {
		type = {
			TypeOf: properties.type,
			TsType: '',
			Ref: '',
		};
		switch (properties.type) {
			case 'string':
				type.TypeOf = 'string';
				type.TsType = 'string';
				break;
			case 'number':
			case 'integer':
				type.TypeOf = 'number';
				type.TsType = 'number';
				break;
			case 'boolean':
				type.TypeOf = 'boolean';
				type.TsType = 'boolean';
				break;
			case 'file':
				type.TypeOf = 'file';
				type.TsType = 'string | Blob';
				break;
			default:
				type.TsType = 'boolean';
				break;
		}
	}
	return type;
}

/**
 * swagger 文档格式化
 * @param swagger
 * @param options
 */
function formatData(swagger: any, options: NswagOptions) {
	// 文档模式 是否openapi 模式 还是 默认 swagger模式
	const isOpenApi = swagger.hasOwnProperty('openapi');

	let apiData: ApiData = {
		BaseInfo: {
			Title: swagger.info.title, // 接口标题
			Description: swagger.info.description, // 接口说明
			Version: swagger.info.version, // 接口版本号
		},
		Controllers: [],
		Models: [],
		Enums: [],
	};

	// 格式化属性方法
	function fmProperties(properties: any, model: Model, required = []) {
		forEach(properties, function (propertie, name) {
			const newp: Propertie = {
				Name: name,
				Description: removeLineBreak(propertie.description),
				Type: convertType(propertie, options),
				Nullable: true,
			};
			if (propertie.hasOwnProperty('nullable')) {
				newp.Nullable = propertie.nullable;
			} else {
				if (required.find((r) => r == name)) {
					newp.Nullable = false;
				}
			}
			model.Properties.push(newp);
		});
	}

	// dto对象 / enum对象
	forEach(isOpenApi ? swagger.components.schemas : swagger.definitions, function (definition, name) {
		if (definition.hasOwnProperty('enum')) {
			const e: Enum = {
				Name: options.FormatModelName(name),
				Description: removeLineBreak(definition.description),
				Items: [],
			};
			const enums = zipObject(definition['x-enumNames'], definition.enum);
			forEach(enums, function (enumValue, enumName) {
				const item: EnumItem = {
					Name: enumName,
					Value: Number(enumValue),
				};
				e.Items.push(item);
			});

			apiData.Enums.push(e);
		} else {
			const m: Model = {
				Name: options.FormatModelName(name),
				Description: removeLineBreak(definition.description),
				IsParameter: false,
				BaseModel: '',
				Properties: [],
			};

			// 格式化属性
			if (definition.hasOwnProperty('allOf')) {
				forEach(definition.allOf, function (propertie) {
					if (propertie.hasOwnProperty('$ref')) {
						m.BaseModel = options.FormatModelName(
							propertie.$ref.substring(propertie.$ref.lastIndexOf('/') + 1)
						);
					} else {
						if (propertie.hasOwnProperty('properties')) {
							fmProperties(propertie.properties, m);
						}
					}
				});
			} else if (definition.hasOwnProperty('required')) {
				fmProperties(definition.properties, m, definition.required);
			} else {
				fmProperties(definition.properties, m);
			}

			apiData.Models.push(m);
		}
	});

	// 模块
	mapKeys(swagger.ControllerDesc, function (value, key) {
		apiData.Controllers.push({
			Name: options.FormatControllerName(key),
			Description: removeLineBreak(value) || '后台太懒没写注释',
			Methods: [],
			ImportModels: [],
		});
		return key;
	});

	// 方法
	forEach(swagger.paths, function (api, url) {
		forEach(api, function (md, requestName) {
			// 模块名称
			const cName = options.FormatControllerName(md.tags[0]);
			// 当前模块
			let currController = find(apiData.Controllers, { Name: cName });
			if (!currController) {
				// 没有就新加一个模块
				currController = {
					Name: cName,
					Description: '后台太懒没写注释',
					Methods: [],
					ImportModels: [],
				};
				apiData.Controllers.push(currController);
			}
			// 方法名称
			let mName = options.FormatMethodName(url);
			mName = reName(mName, currController.Methods);

			// 添加方法
			const method: ApiMethod = {
				Name: mName,
				Url: url,
				Description: removeLineBreak(md.summary) || '后台太懒没写注释',
				RequestName: requestName,
				Parameters: [],
				ParametersQuery: [],
				ParametersBody: [],
				ParametersFormData: [],
				ParametersHeader: [],
				ParametersPath: [],
				Responses: convertType(
					//todo: swagger写注解@ApiResponse({status: 200})才会有这个属性，要不然是default
					md.responses['200']
						? isOpenApi
							? md.responses['200'].content
								? md.responses['200'].content['application/json'].schema
								: 'any'
							: md.responses['200'].schema
						: 'any',
					options
				),
				MockData: null,
			};
			// 方法参数处理
			// 兼容openapi 模式 requestBody 参数
			if (isOpenApi && md.requestBody) {
				md.parameters = [];
				md.parameters.push(
					Object.assign(
						{
							name: md.requestBody['x-name'] || 'input',
							required: md.requestBody.required || true,
							in: 'body',
							description: '后台太懒没有写注释',
						},
						md.requestBody.content['application/json']
					)
				);
			}
			forEach(md.parameters, (parameter: any) => {
				let pa: Parameter = {
					Name: parameter.name,
					CamelCaseName: reName(getParameterName(parameter.name), method.Parameters),
					Description: removeLineBreak(parameter.description),
					In: parameter.in,
					Required: parameter.required,
					Default: '',
					Type: convertType(parameter, options),
				};
				if (pa.In === 'query') {
					method.ParametersQuery.push(pa);
					method.Parameters.push(pa);
				}
				if (pa.In === 'body') {
					method.ParametersBody.push(pa);
					method.Parameters.push(pa);
				}
				if (pa.In === 'formData') {
					method.ParametersFormData.push(pa);
					method.Parameters.push(pa);
				}
				if (pa.In === 'header') {
					method.ParametersHeader.push(pa);
				}
				if (pa.In === 'path') {
					method.ParametersPath.push(pa);
					method.Parameters.push(pa);
				}

				// 接口参数：存在引用型参数&没有没添加到引用列表的则添加到引用列表
				if (pa.Type.Ref && currController && currController.ImportModels.indexOf(pa.Type.Ref) == -1) {
					currController.ImportModels.push(pa.Type.Ref);
					// 标记为输入参数对象
					const d = find(apiData.Models, { Name: pa.Type.Ref });
					if (d) {
						d.IsParameter = true;
					}
				}
			});
			// 排序一下参数，把非必填参数排后面
			method.Parameters = orderBy(method.Parameters, ['Required'], ['desc']);

			// 返回值：存在引用型参数&没有没添加到引用列表的则添加到引用列表
			method.Responses.Ref &&
				currController &&
				currController.ImportModels.indexOf(method.Responses.Ref) == -1 &&
				currController.ImportModels.push(method.Responses.Ref);
			// 添加方法
			currController.Methods.push(method);
		});
	});

	// 调整方法顺序，因为mock时 有可能匹配错误的mock拦截
	apiData.Controllers.map((c) => {
		c.Methods = orderBy(c.Methods, ['Name'], ['desc']);
		return c;
	});

	// 清理无方法空模块
	remove(apiData.Controllers, (c: ApiController) => {
		return c.Methods.length <= 0;
	});
	return apiData;
}

/**
 * 格式化成TS统一模板格式数据-数据源
 * @param swaggerUrl
 * @param options
 */
function getApiData(swaggerUrl: string, options: NswagOptions): Promise<ApiData> {
	return new Promise((resolve, reject) => {
		getSwaggerData(swaggerUrl)
			.then((r: any) => {
				const apiData = formatData(r, options);
				resolve(apiData);
			})
			.catch((e) => {
				reject(e);
			});
	});
}

/**
 * 生成
 * @param apiData 标准化数据
 * @param options 生成配置
 */
async function codeBuild(apiData: ApiData, options: NswagOptions) {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = _path.dirname(__filename);

	if (!options.OutPath) {
		console.log("请设置绝对路径输出目录")
		process.exit(0);
	}
	const savePath = options.OutPath;
	const saveBasePath = _path.join(savePath, 'base');
	const saveMethodDir = _path.join(savePath, 'api');
	const saveModelsDir = _path.join(savePath, 'model');

	const tplPath = options.TplPath || _path.join(__dirname, './tpl');
	const tplMethodPath = _path.join(tplPath, 'method.ejs');
	const tplModelsPath = _path.join(tplPath, 'model.ejs');
	const tplBasePath = _path.join(tplPath, 'base.ejs');

	if (fs.existsSync(saveBasePath)) {
		const { ok } = await inquirer.prompt([
			{
				name: 'ok',
				type: 'confirm',
				default: false,
				message: `基类已存在，是否重新生成？`
			}
		])
		if (ok) {
			console.log('清理所有旧文件');
			removeDirSync(savePath);

			console.log('生成基类');
			codeRender(tplBasePath, { options }, saveBasePath, "useAxios.ts");
		} else {
			console.log('清理接口文件');
			removeDirSync(saveMethodDir);
			console.log('清理模型文件');
			removeDirSync(saveModelsDir);
		}
	} else {
		console.log('生成基类');
		// 生成-基类
		codeRender(tplBasePath, { options }, saveBasePath, "useAxios.ts");
	}
	console.log('生成dto对象');
	// 生成-dto对象
	codeRender(tplModelsPath, { apiData, options }, saveModelsDir, 'index.ts');
	console.log('生成接口');
	// 按模块生成接口
	apiData.Controllers.forEach((controller: any) => {
		// 生成-接口
		codeRender(tplMethodPath, { controller, options }, saveMethodDir, controller.Name + '.ts');
	});
	console.log('\n接口生成成功' + saveMethodDir);
}

/**
 * 生成
 * @param apiData 标准化数据
 * @param options 生成配置
 */
export default async function build(options: NswagOptions) {
	const apiData = await getApiData(options.SwaggerUrl, options);
	await codeBuild(apiData, options);
}
