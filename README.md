# swaggergenerateapi

## Installation

```bash
$ pnpm i -D swaggergenerateapi esno
```

## 创建文件 generateApi.ts
```bash
import init from 'swaggergenerateapi';
import * as path from 'path';

(async () => {
  await init([{
    SwaggerUrl: 'http://127.0.0.1:8088/api-json', // 接口文档地址
    ApiBase: 'http://127.0.0.1:8088/', // 接口根节点
    OutPath: path.resolve('src', 'apiCenter'),
  } as any]);
})();
```

## 执行

```bash
$ npx esno generateApi.ts
```