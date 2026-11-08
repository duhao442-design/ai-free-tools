import Vue from 'vue';
import VueRouter from 'vue-router';
import MainLayout from '@/layout/MainLayout.vue';

Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/works',
    children: [
      { path: 'works', name: 'works', component: () => import('@/views/Works.vue'), meta: { title: '作品管理', icon: 'el-icon-folder-opened' } },
      { path: 'works/:id', name: 'work-detail', component: () => import('@/views/WorkDetail.vue'), meta: { title: '作品详情', hideMenu: true } },
      { path: 'works/:id/reader', name: 'work-reader', component: () => import('@/views/ComicReaderPage.vue'), meta: { title: '漫画成品页', hideMenu: true } },
      { path: 'workflows', name: 'workflows', component: () => import('@/views/Workflows.vue'), meta: { title: '工作流管理', icon: 'el-icon-s-order' } },
      { path: 'workflows/:id', name: 'workflow-edit', component: () => import('@/views/WorkflowEdit.vue'), meta: { title: '工作流配置', hideMenu: true } },
      { path: 'pages', name: 'pages', component: () => import('@/views/Pages.vue'), meta: { title: '页面管理', icon: 'el-icon-document' } },
      { path: 'pages/:id/design', name: 'page-design', component: () => import('@/views/PageDesigner.vue'), meta: { title: '页面设计', hideMenu: true } },
      { path: 'components', name: 'components', component: () => import('@/views/Components.vue'), meta: { title: '组件管理', icon: 'el-icon-s-grid' } },
      { path: 'components/:id', name: 'component-edit', component: () => import('@/views/ComponentEdit.vue'), meta: { title: '组件配置', hideMenu: true } },
      { path: 'models', name: 'models', component: () => import('@/views/Models.vue'), meta: { title: '模型管理', icon: 'el-icon-cpu' } },
      { path: 'models/:id/test', name: 'model-test', component: () => import('@/views/ModelTest.vue'), meta: { title: '模型测试', hideMenu: true } },
      { path: 'interfaces', name: 'interfaces', component: () => import('@/views/Interfaces.vue'), meta: { title: '接口管理', icon: 'el-icon-connection' } },
      { path: 'assets', name: 'assets', component: () => import('@/views/Assets.vue'), meta: { title: '资产管理', icon: 'el-icon-collection' } },
      { path: 'settings', name: 'settings', component: () => import('@/views/Settings.vue'), meta: { title: '项目设置', icon: 'el-icon-setting' } },
    ],
  },
  { path: '*', redirect: '/works' },
];

const router = new VueRouter({ routes });

router.afterEach((to) => {
  const title = to.meta && to.meta.title ? to.meta.title : '';
  document.title = title ? `${title} · AI Free Tools` : 'AI Free Tools';
});

export default router;
