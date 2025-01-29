export const DOMUtils = {
    createElement(tag, attributes = {}, textContent = '') {
      const element = document.createElement(tag);
      Object.keys(attributes).forEach((key) => {
        element.setAttribute(key, attributes[key]);
      });
      if (textContent) element.textContent = textContent;
      return element;
    },
  };
  