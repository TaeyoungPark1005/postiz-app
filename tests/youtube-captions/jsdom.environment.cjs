const NodeEnvironment = require('jest-environment-node').TestEnvironment;
const { Window } = require('happy-dom');

class HappyDomEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    this.browserWindow = new Window({ url: 'http://localhost/' });
    const window = this.browserWindow;

    this.global.window = window;
    this.global.document = window.document;
    this.global.navigator = window.navigator;
    this.global.location = window.location;
    this.global.HTMLElement = window.HTMLElement;
    this.global.Element = window.Element;
    this.global.Node = window.Node;
    this.global.Event = window.Event;
    this.global.MouseEvent = window.MouseEvent;
    this.global.KeyboardEvent = window.KeyboardEvent;
    this.global.CustomEvent = window.CustomEvent;
    this.global.MutationObserver = window.MutationObserver;
    this.global.File = window.File;
    this.global.Blob = window.Blob;
    this.global.FormData = window.FormData;
    this.global.getComputedStyle = window.getComputedStyle.bind(window);
    this.global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
    this.global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  }

  async teardown() {
    await this.browserWindow?.close();
    await super.teardown();
  }
}

module.exports = HappyDomEnvironment;
