import type { AppDefinition } from '../../portfolio-electron-shared/src/models';

export const appDefinition: AppDefinition = {
  id: 'photo-processor',
  name: 'Photo Processor',
  sections: ['Import Queue', 'Published Image', 'Settings', 'Recovery', 'About'],
  primaryAction: 'Add to Photo Catalog',
  ownsPixelProcessing: true,
};
