import { AppController } from './app.controller';

describe('AppController', () => {
  const controller = new AppController();

  it('answers the root and health checks used by the deploy', () => {
    expect(controller.getHello()).toBe('running');
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
