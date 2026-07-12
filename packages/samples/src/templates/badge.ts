import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'
// ---------------------------------------------------------------------------
// Badge data source
// ---------------------------------------------------------------------------
export const badgeDataSource: DataSourceDescriptor = {
  id: 'badge',
  name: 'badge',
  title: '工牌',
  expand: true,
  fields: [
    { name: 'photo', title: '照片', path: 'photo', use: 'image' },
    { name: 'name', title: '姓名', path: 'name', use: 'text' },
    { name: 'department', title: '部门', path: 'department', use: 'text' },
    { name: 'title', title: '职位', path: 'title', use: 'text' },
    { name: 'employeeId', title: '工号', path: 'employeeId', use: 'barcode' },
    { name: 'company', title: '公司', path: 'company', use: 'text' },
  ],
}
export const badgeDemoData: Record<string, unknown> = {
  photo: 'https://via.placeholder.com/120x160/e8e8e8/999999?text=Photo',
  name: '张三',
  department: '技术部',
  title: '高级工程师',
  employeeId: 'EMP-20260001',
  company: '示例科技有限公司',
}
// ---------------------------------------------------------------------------
// Badge template (card size 86x54mm, fixed mode)
// ---------------------------------------------------------------------------
export const badgeTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'fixed',
    width: 86,
    height: 54,
    background: {
      color: '#ffffff',
    },
  },
  guides: { x: [], y: [] },
  elements: [
    // Company name header bar
    {
      id: 'badge_header_bg',
      type: 'rect',
      modelVersion: 1,
      x: 0,
      y: 0,
      width: 86,
      height: 12,
      model: {
        fillColor: '#1677ff',
        borderWidth: 0,
        borderColor: 'transparent',
        borderRadius: 0,
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    // Company name
    {
      id: 'badge_company',
      type: 'text',
      modelVersion: 1,
      x: 3,
      y: 1,
      width: 80,
      height: 10,
      model: {
        content: '{#公司}',
        fontSize: 3.53,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#ffffff',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'company',
          fieldLabel: '公司',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // Photo placeholder
    {
      id: 'badge_photo',
      type: 'image',
      modelVersion: 1,
      x: 4,
      y: 15,
      width: 18,
      height: 24,
      model: {
        src: 'https://via.placeholder.com/120x160/e8e8e8/999999?text=Photo',
        fit: 'cover',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'photo',
          fieldLabel: '照片',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // Name (bound)
    {
      id: 'badge_name',
      type: 'text',
      modelVersion: 1,
      x: 26,
      y: 15,
      width: 56,
      height: 10,
      model: {
        content: '{#姓名}',
        fontSize: 5.64,
        fontWeight: 'bold',
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#1a1a1a',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'name',
          fieldLabel: '姓名',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // Department (bound)
    {
      id: 'badge_dept',
      type: 'text',
      modelVersion: 1,
      x: 26,
      y: 26,
      width: 56,
      height: 6,
      model: {
        content: '{#部门}',
        fontSize: 3.18,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'department',
          fieldLabel: '部门',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // Title (bound)
    {
      id: 'badge_title',
      type: 'text',
      modelVersion: 1,
      x: 26,
      y: 33,
      width: 56,
      height: 6,
      model: {
        content: '{#职位}',
        fontSize: 3.18,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'title',
          fieldLabel: '职位',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // Barcode (bound)
    {
      id: 'badge_barcode',
      type: 'barcode',
      modelVersion: 1,
      x: 8,
      y: 42,
      width: 70,
      height: 10,
      model: {
        value: 'EMP-20260001',
        format: 'CODE128',
        showText: true,
        fontSize: 2.47,
        lineColor: '#333333',
      },
      bindings: {
        value: {
          sourceId: 'badge',
          fieldPath: 'employeeId',
          fieldLabel: '工号',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
  ],
}
