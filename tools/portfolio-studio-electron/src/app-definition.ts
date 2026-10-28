import type { AppDefinition } from '../../portfolio-electron-shared/src/models';

export const appDefinition: AppDefinition = {
  id: 'portfolio-studio',
  name: 'Portfolio Studio',
  sections: ['Photography', 'Engineering', 'Archive', 'Settings', 'About'],
  primaryAction: 'Save Locally',
  ownsPixelProcessing: false,
};
