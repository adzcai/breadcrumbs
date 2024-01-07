export const fragWithHTML = (html: string) => createFragment((frag) => {
  frag.createDiv().innerHTML = html;
});

export const details = (text: string, parent: HTMLElement) => parent.createEl('details', {}, (d) => d.createEl('summary', { text }));

export const subDetails = (text: string, parent: HTMLDetailsElement) => parent.createDiv({
  attr: { style: 'padding-left: 10px;' },
})
  .createEl('details', {}, (d) => d.createEl('summary', { text }));
