import type { AIMaterialDescriptor } from '@easyink/shared'

export const imageAIMaterialDescriptor = {
  type: 'image',
  description: 'Image block for logos, product images, stamps, and externally supplied image URLs.',
  properties: ['src', 'fit', 'alt', 'backgroundColor', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['src', 'fit', 'alt'],
  binding: 'single',
  usage: [
    'Use fit contain for logos and cover for cropped photos.',
    'Bind image fields only when the data source provides an image URL.',
  ],
} satisfies AIMaterialDescriptor
