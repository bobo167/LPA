import init from './src/index';
await init([{
  SwaggerUrl: 'http://127.0.0.1:8088/api-json', // 接口文档地址（必填）
  ApiBase: 'http://127.0.0.1:8088/', // 接口根节点（必填）
  OutPath: './apiCenter',
  TplPath: './tpl',
} as any])