<template>
  <div class="aift-card table-card">
    <div class="table-card-head">
      <div>
        <div class="table-card-title">{{ title }}</div>
        <div v-if="desc" class="table-card-desc">{{ desc }}</div>
      </div>
      <div class="table-card-actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.search" class="table-card-search">
      <slot name="search" />
    </div>
    <div class="table-card-body" v-loading="loading">
      <slot />
    </div>
    <div v-if="total !== undefined && total !== null" class="table-card-foot">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="(v) => $emit('update:page', v)"
        @size-change="(v) => $emit('update:pageSize', v)"
      />
    </div>
  </div>
</template>

<script>
export default {
  name: 'PageTableCard',
  props: {
    title: { type: String, default: '' },
    desc: { type: String, default: '' },
    total: { type: Number, default: undefined },
    page: { type: Number, default: 1 },
    pageSize: { type: Number, default: 20 },
    loading: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.table-card {
  padding: 14px 16px 16px;
}

.table-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.table-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.table-card-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 3px;
}

.table-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.table-card-search {
  margin-bottom: 10px;
}

.table-card-body {
  min-height: 60px;
}

.table-card-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
