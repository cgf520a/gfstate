/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    // 使用 ts-jest 处理 ts/tsx 文件
    '^.+\\.tsx?$': 'ts-jest',
  },
  // 如果你的测试文件在 src 目录下
  roots: ['<rootDir>/src'],
  // 匹配测试文件的模式
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // 模块名映射，如果你的代码中有 import css 等资源文件，需要 mock 掉
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
