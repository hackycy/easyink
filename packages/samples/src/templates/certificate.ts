import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'

// ---------------------------------------------------------------------------
// Certificate data source
// ---------------------------------------------------------------------------

export const certificateDataSource: DataSourceDescriptor = {
  id: 'certificate',
  name: 'certificate',
  title: '证书',
  expand: true,
  fields: [
    { name: 'name', title: '姓名', path: 'name', use: 'text' },
    { name: 'course', title: '课程名称', path: 'course', use: 'text' },
    { name: 'date', title: '颁发日期', path: 'date', use: 'text' },
    { name: 'certNo', title: '证书编号', path: 'certNo', use: 'text' },
    { name: 'verifyUrl', title: '验证链接', path: 'verifyUrl', use: 'qrcode' },
    { name: 'instructor', title: '讲师', path: 'instructor', use: 'text' },
    { name: 'organization', title: '颁发机构', path: 'organization', use: 'text' },
  ],
}

export const certificateDemoData: Record<string, unknown> = {
  name: '李明',
  course: 'Vue.js 高级开发实战',
  date: '2026年4月16日',
  certNo: 'CERT-2026-0416-001',
  verifyUrl: 'https://example.com/verify/CERT-2026-0416-001',
  instructor: '王老师',
  organization: '示例培训学院',
}

// ---------------------------------------------------------------------------
// Certificate template (A4 landscape, fixed mode)
// ---------------------------------------------------------------------------

export const certificateTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'fixed',
    width: 297,
    height: 210,
    background: {
      color: '#fffdf5',
    },
  },
  guides: { x: [], y: [] },
  elements: [
    // Decorative border (outer)
    {
      id: 'cert_border_outer',
      type: 'rect',
      x: 8,
      y: 8,
      width: 281,
      height: 194,
      props: {
        fillColor: 'transparent',
        borderWidth: 2,
        borderColor: '#c5a55a',
        borderRadius: 0,
      },
    },
    // Decorative border (inner)
    {
      id: 'cert_border_inner',
      type: 'rect',
      x: 12,
      y: 12,
      width: 273,
      height: 186,
      props: {
        fillColor: 'transparent',
        borderWidth: 0.5,
        borderColor: '#c5a55a',
        borderRadius: 0,
      },
    },
    // Decorative top line
    {
      id: 'cert_line_top',
      type: 'line',
      x: 40,
      y: 55,
      width: 217,
      height: 0,
      props: {
        lineWidth: 0.5,
        lineColor: '#c5a55a',
        lineType: 'solid',
      },
    },
    // Title
    {
      id: 'cert_title',
      type: 'text',
      x: 48,
      y: 28,
      width: 201,
      height: 22,
      props: {
        content: '培训完成证书',
        fontSize: 32,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#333333',
        letterSpacing: 4,
      },
    },
    // Subtitle
    {
      id: 'cert_subtitle',
      type: 'text',
      x: 48,
      y: 58,
      width: 201,
      height: 10,
      props: {
        content: 'CERTIFICATE OF COMPLETION',
        fontSize: 10,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#999999',
        letterSpacing: 3,
      },
    },
    // "This is to certify that" text
    {
      id: 'cert_preamble',
      type: 'text',
      x: 48,
      y: 76,
      width: 201,
      height: 8,
      props: {
        content: '兹证明',
        fontSize: 12,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#666666',
      },
    },
    // Name (bound)
    {
      id: 'cert_name',
      type: 'text',
      x: 48,
      y: 88,
      width: 201,
      height: 16,
      props: {
        content: '{#姓名}',
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#1a1a1a',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'name',
        fieldLabel: '姓名',
      },
    },
    // Name underline
    {
      id: 'cert_name_line',
      type: 'line',
      x: 80,
      y: 104,
      width: 137,
      height: 0,
      props: {
        lineWidth: 0.5,
        lineColor: '#333333',
        lineType: 'solid',
      },
    },
    // Course description
    {
      id: 'cert_course_label',
      type: 'text',
      x: 48,
      y: 110,
      width: 201,
      height: 8,
      props: {
        content: '已成功完成以下课程',
        fontSize: 11,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#666666',
      },
    },
    // Course name (bound)
    {
      id: 'cert_course',
      type: 'text',
      x: 48,
      y: 120,
      width: 201,
      height: 12,
      props: {
        content: '{#课程名称}',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#333333',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'course',
        fieldLabel: '课程名称',
      },
    },
    // Date (bound)
    {
      id: 'cert_date',
      type: 'text',
      x: 20,
      y: 160,
      width: 80,
      height: 8,
      props: {
        content: '{#颁发日期}',
        fontSize: 10,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#666666',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'date',
        fieldLabel: '颁发日期',
      },
    },
    // Date underline
    {
      id: 'cert_date_line',
      type: 'line',
      x: 20,
      y: 158,
      width: 80,
      height: 0,
      props: {
        lineWidth: 0.5,
        lineColor: '#333333',
        lineType: 'solid',
      },
    },
    // Date label
    {
      id: 'cert_date_label',
      type: 'text',
      x: 20,
      y: 170,
      width: 80,
      height: 6,
      props: {
        content: '日期',
        fontSize: 9,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#999999',
      },
    },
    // Instructor (bound)
    {
      id: 'cert_instructor',
      type: 'text',
      x: 108,
      y: 160,
      width: 80,
      height: 8,
      props: {
        content: '{#讲师}',
        fontSize: 10,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#666666',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'instructor',
        fieldLabel: '讲师',
      },
    },
    // Instructor underline
    {
      id: 'cert_instructor_line',
      type: 'line',
      x: 108,
      y: 158,
      width: 80,
      height: 0,
      props: {
        lineWidth: 0.5,
        lineColor: '#333333',
        lineType: 'solid',
      },
    },
    // Instructor label
    {
      id: 'cert_instructor_label',
      type: 'text',
      x: 108,
      y: 170,
      width: 80,
      height: 6,
      props: {
        content: '讲师签名',
        fontSize: 9,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#999999',
      },
    },
    // Certificate number (bound)
    {
      id: 'cert_no',
      type: 'text',
      x: 197,
      y: 160,
      width: 80,
      height: 8,
      props: {
        content: '{#证书编号}',
        fontSize: 9,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#999999',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'certNo',
        fieldLabel: '证书编号',
      },
    },
    // QR code for verification (bound)
    {
      id: 'cert_qrcode',
      type: 'qrcode',
      x: 247,
      y: 140,
      width: 28,
      height: 28,
      props: {
        value: 'https://example.com/verify',
        cellSize: 3,
        margin: 1,
        foreground: '#333333',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'verifyUrl',
        fieldLabel: '验证链接',
      },
    },
    // Organization (bound)
    {
      id: 'cert_org',
      type: 'text',
      x: 48,
      y: 140,
      width: 201,
      height: 8,
      props: {
        content: '{#颁发机构}',
        fontSize: 11,
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#666666',
      },
      binding: {
        sourceId: 'certificate',
        fieldPath: 'organization',
        fieldLabel: '颁发机构',
      },
    },
  ],
}
