export default defineAppConfig({
  // documents 作为首页：已登录用户直达文档列表；未登录由 useAuthGuard 跳到 login。
  pages: [
    'pages/documents/index',
    'pages/login/index',
    'pages/viewer/index',
    'pages/history/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#181818',
    navigationBarTitleText: 'JStudio',
    navigationBarTextStyle: 'white'
  }
})
