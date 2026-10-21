// Extrai da página um resumo compacto dos elementos interativos para o LLM
export async function snapshot(page) {
  return page.evaluate(() => {
    const sel = (el) =>
      el.dataset.testid ? `[data-testid="${el.dataset.testid}"]`
      : el.id ? `#${el.id}`
      : el.name ? `${el.tagName.toLowerCase()}[name="${el.name}"]`
      : el.type && el.tagName === 'INPUT' ? `input[type="${el.type}"]`
      : el.innerText?.trim() ? `${el.tagName.toLowerCase()}:has-text("${el.innerText.trim().slice(0, 60)}")`
      : el.tagName.toLowerCase();
    const elements = [...document.querySelectorAll('input, button, a[href], select, textarea')].map((el) => ({
      selector: sel(el),
      tag: el.tagName.toLowerCase(),
      type: el.type || undefined,
      placeholder: el.placeholder || undefined,
      text: (el.innerText || '').trim().slice(0, 60) || undefined,
    }));
    return {
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()),
      elements,
    };
  });
}
