<template>
  <component
    :is="componentImpl"
    v-bind="boundProps"
    v-on="listeners"
  />
</template>

<script>
import builtin from './builtin';
import UserComponent from './UserComponent.vue';

export default {
  name: 'RuntimeBlock',
  props: {
    block: { type: Object, required: true },
    resolved: { type: Object, default: () => ({}) },
    specMap: { type: Object, default: null },
  },
  computed: {
    hit() {
      return this.resolved[this.block.id] || null;
    },
    componentImpl() {
      if (builtin[this.block.component]) return builtin[this.block.component];
      return UserComponent;
    },
    boundProps() {
      const props = this.hit ? this.hit.props : this.block.props || {};
      if (builtin[this.block.component]) return props;
      return {
        spec: (this.hit && this.hit.spec) || (this.specMap && this.specMap[this.block.component]) || this.block.spec || null,
        componentKey: this.block.component,
        propsData: props,
      };
    },
    listeners() {
      return {
        refresh: () => this.$emit('refresh'),
        'switch-step': (i) => this.$emit('switch-step', i),
        action: (payload) => this.$emit('action', payload),
      };
    },
  },
};
</script>
