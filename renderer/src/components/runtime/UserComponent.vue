<template>
  <div class="user-component">
    <div v-if="!spec" class="text-muted uc-missing">
      自定义组件 <b>{{ componentKey }}</b> 缺少渲染配置（render_spec）
    </div>
    <user-node v-else :node="spec" :props-data="propsData" @action="$emit('action', $event)" />
  </div>
</template>

<script>
import UserNode from './UserNode.vue';

export default {
  name: 'UserComponent',
  components: { UserNode },
  props: {
    spec: { type: Object, default: null },
    componentKey: { type: String, default: '' },
    propsData: { type: Object, default: () => ({}) },
  },
};
</script>

<style scoped>
.uc-missing {
  font-size: 12px;
  padding: 8px 0;
}
</style>
