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
      x: 0,
      y: 0,
      width: 86,
      height: 12,
      props: {
        fillColor: '#1677ff',
        borderWidth: 0,
        borderColor: 'transparent',
        borderRadius: 0,
      },
    },
    // Company name
    {
      id: 'badge_company',
      type: 'text',
      x: 3,
      y: 1,
      width: 80,
      height: 10,
      props: {
        content: '{#公司}',
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#ffffff',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'company',
        fieldLabel: '公司',
      },
    },
    // Photo placeholder
    {
      id: 'badge_photo',
      type: 'image',
      x: 4,
      y: 15,
      width: 18,
      height: 24,
      props: {
        src: 'https://via.placeholder.com/120x160/e8e8e8/999999?text=Photo',
        fit: 'cover',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'photo',
        fieldLabel: '照片',
      },
    },
    // Name (bound)
    {
      id: 'badge_name',
      type: 'text',
      x: 26,
      y: 15,
      width: 56,
      height: 10,
      props: {
        content: '{#姓名}',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#1a1a1a',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'name',
        fieldLabel: '姓名',
      },
    },
    // Department (bound)
    {
      id: 'badge_dept',
      type: 'text',
      x: 26,
      y: 26,
      width: 56,
      height: 6,
      props: {
        content: '{#部门}',
        fontSize: 9,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'department',
        fieldLabel: '部门',
      },
    },
    // Title (bound)
    {
      id: 'badge_title',
      type: 'text',
      x: 26,
      y: 33,
      width: 56,
      height: 6,
      props: {
        content: '{#职位}',
        fontSize: 9,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'title',
        fieldLabel: '职位',
      },
    },
    // Barcode (bound)
    {
      id: 'badge_barcode',
      type: 'barcode',
      x: 8,
      y: 42,
      width: 70,
      height: 10,
      props: {
        value: 'EMP-20260001',
        format: 'CODE128',
        showText: true,
        fontSize: 7,
        lineColor: '#333333',
      },
      binding: {
        sourceId: 'badge',
        fieldPath: 'employeeId',
        fieldLabel: '工号',
      },
    },
  ],
}
