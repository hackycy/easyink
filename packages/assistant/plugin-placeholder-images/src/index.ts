import type { AssistantPlugin } from '@easyink/assistant-plugins'

export const placeholderImagesPlugin = {
  manifest: {
    id: 'easyink.official.placeholder-images',
    name: '占位图助手',
    description: '在原型、H5、海报等场景中，为未指定图片的位置使用随机占位图。',
    version: '0.0.19',
    category: '官方提示词',
    defaultEnabled: false,
    staticContributions: [
      {
        target: 'schema',
        priority: 60,
        title: 'Picsum placeholder image rule',
        content: 'When the user asks for a prototype, H5 page, poster, or screen design and image content is needed but no exact asset is provided, use https://picsum.photos/{width}/{height} as the image URL. Match {width} and {height} to the generated image element size in px when schema.unit is px; otherwise convert the visual size to a reasonable pixel placeholder dimension.',
      },
    ],
  },
} satisfies AssistantPlugin

export default placeholderImagesPlugin
