/**
 * 运行时组件公共逻辑：所有内置组件通过 inject('aiftRuntime') 访问当前页面上下文与动作。
 */
export default {
  inject: {
    aiftRuntime: { default: null },
  },
  computed: {
    rt() {
      return this.aiftRuntime || {};
    },
    context() {
      return this.rt.context || { gb: {}, stepList: [] };
    },
    gb() {
      return this.context.gb || {};
    },
  },
  methods: {
    notify(msg, type = 'success') {
      if (this.$message && this.$message[type]) this.$message[type](msg);
    },
    error(msg) {
      this.notify(msg, 'error');
    },
  },
};
