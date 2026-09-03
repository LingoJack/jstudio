import type { UserConfigExport } from '@tarojs/cli'

// 仅 weapp 端；生产构建默认开启压缩。
export default {
  mini: {},
} satisfies UserConfigExport<'webpack5'>
