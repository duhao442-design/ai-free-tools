<template>
  <el-container class="main-layout">
    <el-aside width="208px" class="side">
      <div class="logo">
        <i class="el-icon-magic-stick logo-icon" />
        <div class="logo-text">
          <div class="logo-title">AI Free Tools</div>
          <div class="logo-sub">低代码 AI 工作流</div>
        </div>
      </div>
      <el-menu :default-active="activeMenu" router class="side-menu">
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <i :class="item.icon" />
          <span slot="title">{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="side-footer">
        <span class="text-muted">v0.1.0 · Electron</span>
      </div>
    </el-aside>

    <el-container>
      <el-header height="52px" class="topbar">
        <div class="topbar-left">
          <i v-if="showBack" class="el-icon-back back-btn" @click="goBack" />
          <span class="topbar-title">{{ currentTitle }}</span>
        </div>
        <div class="topbar-right">
          <el-tooltip :content="apiBase || '未连接本地服务'" placement="bottom">
            <span class="conn-dot" :class="{ on: !!apiBase }" />
          </el-tooltip>
          <span class="text-muted conn-text">{{ apiBase ? '本地服务已连接' : '浏览器调试模式' }}</span>
        </div>
      </el-header>
      <el-main class="content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script>
import { apiBase } from '@/api';

export default {
  name: 'MainLayout',
  data() {
    return {
      apiBase,
      menus: [
        { path: '/works', title: '作品管理', icon: 'el-icon-folder-opened' },
        { path: '/workflows', title: '工作流管理', icon: 'el-icon-s-order' },
        { path: '/pages', title: '页面管理', icon: 'el-icon-document' },
        { path: '/components', title: '组件管理', icon: 'el-icon-s-grid' },
        { path: '/models', title: '模型管理', icon: 'el-icon-cpu' },
        { path: '/interfaces', title: '接口管理', icon: 'el-icon-connection' },
        { path: '/assets', title: '资产管理', icon: 'el-icon-collection' },
        { path: '/settings', title: '项目设置', icon: 'el-icon-setting' },
      ],
    };
  },
  computed: {
    activeMenu() {
      const p = this.$route.path;
      const hit = this.menus.find((m) => p === m.path || p.startsWith(`${m.path}/`));
      return hit ? hit.path : p;
    },
    currentTitle() {
      return (this.$route.meta && this.$route.meta.title) || '';
    },
    showBack() {
      return !!(this.$route.meta && this.$route.meta.hideMenu);
    },
  },
  methods: {
    goBack() {
      if (window.history.length > 1) this.$router.back();
      else this.$router.push('/works');
    },
  },
};
</script>

<style scoped>
.main-layout {
  height: 100%;
}

.side {
  background: #1f2733;
  color: #c0c6d1;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 14px;
}

.logo-icon {
  font-size: 22px;
  color: #6ea8fe;
}

.logo-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
}

.logo-sub {
  font-size: 11px;
  color: #8b95a6;
  margin-top: 2px;
}

.side-menu {
  flex: 1;
  background: transparent;
  padding: 4px 8px;
}

.side-menu ::v-deep .el-menu-item {
  color: #b6bdca;
  height: 40px;
  line-height: 40px;
  border-radius: 6px;
  margin-bottom: 2px;
}

.side-menu ::v-deep .el-menu-item i {
  color: #8b95a6;
}

.side-menu ::v-deep .el-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.side-menu ::v-deep .el-menu-item.is-active {
  background: #2b6cb0;
  color: #fff;
}

.side-menu ::v-deep .el-menu-item.is-active i {
  color: #fff;
}

.side-footer {
  padding: 10px 18px 14px;
  font-size: 11px;
}

.topbar {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #eceff3;
  padding: 0 18px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back-btn {
  cursor: pointer;
  font-size: 16px;
  color: #606266;
}

.back-btn:hover {
  color: #409eff;
}

.topbar-title {
  font-size: 14px;
  font-weight: 600;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f0c04a;
  display: inline-block;
}

.conn-dot.on {
  background: #67c23a;
}

.conn-text {
  font-size: 12px;
}

.content {
  background: #f2f4f7;
  padding: 0;
  overflow: auto;
}
</style>
