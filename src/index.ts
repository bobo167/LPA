import build from './build';
import { NswagOptions, Propertie } from './types';
import { camelCase } from 'lodash-es';

/**
 * 设置默认参数
 * @param options 外部参数
 */
function defNswagOptions(options: NswagOptions) {
	/**
	 * 格式化模块名称（默认：接口名称+Api）
	 * @param name 名称
	 */
	function formatControllerName(name: string) {
		return name.indexOf('Api') !== -1 ? name : name + 'Api';
	}
	/**
	 * 格式化接口名称（默认：小驼峰命名）
	 * @param name 名称
	 */
	function formatMethodName(name: string) {
		if (name === '/' || name === '') {
			return '';
		}
		const fnName = name.substring(name.lastIndexOf('/'));
		return camelCase(fnName);
	}
	/**
	 * 格式化dto对象、枚举名称（默认：只会去除特殊字符）
	 * @param name 名称
	 */
	function formatModelName(name: string) {
		return name.replace(/[.,\[\]]/g, '');
	}

	const def: NswagOptions = {
		SwaggerUrl: '',
		ApiBase: '',
		OutPath: '',
		TplPath: '',
		FormatControllerName: formatControllerName,
		FormatMethodName: formatMethodName,
		FormatModelName: formatModelName,
	};
	return Object.assign(def, options);
}

/**
 * 初始化
 */
export default async function init(configs: NswagOptions [] = []) {
	// 生成接口
	let i = 0;
	while (i < configs.length) {
		const config = configs[i];
		if (!config.SwaggerUrl) {
			console.log('接口地址[SwaggerUrl]不能为空');
			return;
		}
		if (!config.ApiBase) {
			console.log('接口根目录[ApiBase]不能为空');
			return;
		}
		console.log(`正在生成接口 ${new Date().toLocaleString()}`);
		await build(defNswagOptions(config));
		i++;
	}
	process.exit(0);
}
