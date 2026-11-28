const metrics = [
  { key: 'kcal', name: 'Калории', unit: 'ккал', min: 2500, max: 2500 },
  { key: 'protein', name: 'Белки', unit: 'г', min: 160, max: null },
  { key: 'fat', name: 'Жиры', unit: 'г', min: 75, max: 75 },
  { key: 'carbs', name: 'Углеводы', unit: 'г', min: 290, max: 290 }
];
const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', weekday: 'long' });
const storageKey = 'ration-diary-v1';
const emptyDay = () => ({ foods: [], weight: '', note: '' });
let state = { goals: Object.fromEntries(metrics.map(({ key, min, max }) => [key, { min, max }])), days: {}, presets: {} };
let selected = dateKey(new Date());
let editing = null;
let storageReadable = true;

try {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    state = JSON.parse(saved);
    state.presets ??= Object.fromEntries(Object.keys(state.days).sort().flatMap((date) =>
      state.days[date].foods.map(({ name, values }) => [presetKey(name), { name, values }])));
  }
} catch {
  storageReadable = false;
  byId('storage-error').textContent = 'Не удалось открыть сохранённый дневник.';
}

function save(next) {
  try {
    if (!storageReadable) throw new Error('Storage unavailable');
    localStorage.setItem(storageKey, JSON.stringify(next));
    state = next;
    byId('storage-error').textContent = '';
    return true;
  } catch {
    byId('storage-error').textContent = 'Не удалось сохранить запись. Проверь доступ к хранилищу браузера.';
    window.alert(byId('storage-error').textContent);
    return false;
  }
}

function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');
}

function asDate(key) {
  return new Date(key + 'T12:00:00');
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function portion(food, key) {
  const reference = food.referenceGrams ?? 100;
  return food.values[key] * (food.grams / reference);
}

function totals(foods) {
  return Object.fromEntries(metrics.map(({ key }) => [
    key, foods.reduce((sum, food) => sum + portion(food, key), 0)
  ]));
}

function status(value, { min, max }) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded < min) return 'Ниже цели';
  if (max !== null && rounded > max) return 'Выше цели';
  return 'В цели';
}

function color(label) {
  return label === 'В цели' ? 'within' : 'outside';
}

function goalText({ min, max }) {
  if (max === null) return 'от ' + number.format(min);
  if (min === max) return number.format(min);
  return number.format(min) + '–' + number.format(max);
}

function describe(values) {
  return metrics.map(({ key, unit }, index) => {
    const prefix = ['', 'Б ', 'Ж ', 'У '][index];
    return prefix + number.format(values[key]) + ' ' + unit;
  }).join(' · ');
}

function day() {
  return state.days[selected] || emptyDay();
}

function saveDay(entry, presets = state.presets) {
  const days = { ...state.days, [selected]: entry };
  if (!entry.foods.length && !entry.weight && !entry.note) delete days[selected];
  return save({ ...state, days, presets });
}

function presetKey(name) {
  return name.trim().toLocaleLowerCase('ru');
}

function render() {
  const entry = day();
  byId('date').value = selected;
  byId('day-title').textContent = selected === dateKey(new Date()) ? 'Сегодня' : longDate.format(asDate(selected));
  const values = totals(entry.foods);
  byId('totals').replaceChildren(...metrics.map(({ key, name, unit }) => {
    const label = status(values[key], state.goals[key]);
    const card = element('div', undefined, 'metric ' + color(label));
    card.append(element('span', name), element('strong', number.format(values[key]) + ' ' + unit),
      element('small', 'Цель ' + goalText(state.goals[key])), element('small', label));
    return card;
  }));
  byId('foods').replaceChildren(...entry.foods.map((food, index) => {
    const button = element('button', undefined, 'food');
    const info = element('span', food.name + ' · ' + number.format(food.grams) + ' г');
    info.append(element('small', describe(totals([food]))));
    const edit = element('span', 'Изменить', 'muted');
    button.append(info, edit);
    button.onclick = () => openFood(index);
    return button;
  }));
  if (!entry.foods.length) byId('foods').append(element('p', 'За этот день пока нет продуктов.', 'empty'));
  renderHistory();
}

function renderHistory() {
  const history = byId('history');
  const dates = Object.keys(state.days).sort().reverse();
  history.replaceChildren();
  if (!dates.length) {
    history.append(element('p', 'Здесь появятся дни с продуктами, весом или заметками.', 'empty'));
    return;
  }
  const scroll = element('div', undefined, 'scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', 'Таблица истории');
  const table = element('table');
  const header = table.createTHead().insertRow();
  for (const label of ['Дата', 'ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г', 'Вес, кг', 'Заметка']) {
    const cell = element('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  const sums = totals([]);
  let loggedDays = 0;
  for (const date of dates) {
    const entry = state.days[date];
    const row = body.insertRow();
    const button = element('button', asDate(date).toLocaleDateString('ru'));
    button.onclick = () => { selectDate(date); window.scrollTo(0, 0); };
    row.insertCell().append(button);
    const values = totals(entry.foods);
    if (entry.foods.length) loggedDays++;
    for (const { key } of metrics) {
      const cell = row.insertCell();
      cell.textContent = entry.foods.length ? number.format(values[key]) : '—';
      if (!entry.foods.length) continue;
      const label = status(values[key], state.goals[key]);
      cell.className = color(label);
      cell.title = label;
      cell.setAttribute('aria-label', cell.textContent + ', ' + label);
      sums[key] += values[key];
    }
    row.insertCell().textContent = entry.weight ? number.format(entry.weight) : '—';
    const note = row.insertCell();
    note.className = 'note';
    note.textContent = entry.note || '—';
  }
  if (loggedDays) {
    const row = table.createTFoot().insertRow();
    row.insertCell().textContent = 'Среднее';
    for (const { key } of metrics) row.insertCell().textContent = number.format(sums[key] / loggedDays);
    row.insertCell().colSpan = 2;
  }
  scroll.append(table);
  history.append(scroll);
}

function selectDate(date) {
  selected = date;
  const form = byId('details').elements;
  form.weight.value = day().weight === '' ? '' : String(day().weight).replace('.', ',');
  form.note.value = day().note;
  byId('details-status').textContent = '';
  render();
}

function shiftDate(offset) {
  const date = asDate(selected);
  date.setDate(date.getDate() + offset);
  selectDate(dateKey(date));
}

function numericValue(input) {
  const value = input.value.trim();
  const pattern = input.dataset.nutrient ? /^\d+(?:[.,]\d{1,8})?$/ : /^\d+(?:[.,]\d{1,2})?$/;
  return pattern.test(value) ? Number(value.replace(',', '.')) : NaN;
}

function readNumber(input, { optional = false, positive = false } = {}) {
  if (optional && !input.value.trim()) return null;
  const value = numericValue(input);
  if (Number.isFinite(value) && (!positive || value > 0)) return value;
  input.setCustomValidity(positive ? 'Введи число больше нуля, до двух знаков после запятой.' :
    input.dataset.nutrient ? 'Введи число от нуля, до восьми знаков после запятой.' :
      'Введи число от нуля, до двух знаков после запятой.');
  input.reportValidity();
  return NaN;
}

function numericField(name, label, required = true) {
  const field = element('label', label);
  const input = element('input');
  input.name = name;
  input.inputMode = 'decimal';
  input.maxLength = 12;
  input.required = required;
  field.append(input);
  return field;
}

const foodForm = byId('food-form');
const goalForm = byId('goal-form');
const foodDialog = byId('food-dialog');
const goalDialog = byId('goal-dialog');
const presetSelect = byId('preset');
const foodInfo = byId('food-info');
for (const { key, name, unit } of metrics) {
  const field = numericField(key, name + ', ' + unit);
  const input = field.querySelector('input');
  input.dataset.nutrient = 'true';
  input.maxLength = 24;
  byId('food-fields').append(field);
  const group = element('fieldset', undefined, 'goal-row');
  group.append(element('legend', name + ', ' + unit), numericField(key + '-min', 'Минимум'),
    numericField(key + '-max', 'Максимум', false));
  byId('goal-fields').append(group);
}

function updatePreview() {
  const grams = numericValue(foodForm.elements.grams);
  const values = Object.fromEntries(metrics.map(({ key }) => [key, numericValue(foodForm.elements[key])]));
  const preview = byId('preview');
  if (!(grams > 0 && Object.values(values).every(Number.isFinite))) {
    preview.textContent = 'Заполни поля, чтобы увидеть расчёт.';
    return;
  }
  const referenceGrams = foodForm.elements.basis.value === 'portion' ? grams : 100;
  preview.replaceChildren(
    element('span', 'На 100 г · ' + describe(totals([{ grams: 100, values, referenceGrams }]))),
    element('span', 'На порцию (' + number.format(grams) + ' г) · ' + describe(totals([{ grams, values, referenceGrams }])))
  );
}

function decimalInput(value) {
  return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 8 });
}

function openFood(index = null) {
  editing = index;
  foodForm.reset();
  for (const input of foodForm.querySelectorAll('input')) input.setCustomValidity('');
  const food = day().foods[index];
  const presets = Object.entries(state.presets).sort(([, first], [, second]) => first.name.localeCompare(second.name, 'ru'));
  presetSelect.replaceChildren(new Option('Новый продукт', ''), ...presets.map(([key, preset]) => new Option(preset.name, key)));
  byId('preset-field').hidden = Boolean(food) || !presets.length;
  byId('remember-field').hidden = Boolean(food);
  foodInfo.open = true;
  byId('food-title').textContent = food ? 'Изменить продукт' : 'Добавить продукт';
  byId('remove').hidden = !food;
  if (food) {
    foodForm.elements.namedItem('name').value = food.name;
    foodForm.elements.grams.value = food.grams;
    foodForm.elements.basis.value = food.referenceGrams ? 'portion' : '100';
    for (const { key } of metrics) foodForm.elements[key].value = decimalInput(food.values[key]);
  }
  updatePreview();
  foodDialog.showModal();
  (presets.length && !food ? presetSelect : foodForm.elements.grams).focus();
}

presetSelect.onchange = () => {
  const preset = Object.hasOwn(state.presets, presetSelect.value) ? state.presets[presetSelect.value] : null;
  const name = foodForm.elements.namedItem('name');
  name.value = preset?.name ?? '';
  name.setCustomValidity('');
  foodForm.elements.basis.value = '100';
  for (const { key } of metrics) {
    const input = foodForm.elements[key];
    input.value = preset ? decimalInput(portion({ ...preset, grams: 100 }, key)) : '';
    input.setCustomValidity('');
  }
  foodInfo.open = !preset;
  updatePreview();
  (preset ? foodForm.elements.grams : name).focus();
};

foodForm.addEventListener('input', updatePreview);
foodForm.addEventListener('invalid', ({ target }) => {
  if (foodInfo.contains(target)) foodInfo.open = true;
}, true);
foodForm.onsubmit = (event) => {
  event.preventDefault();
  const nameInput = foodForm.elements.namedItem('name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Введи название продукта.');
    nameInput.reportValidity();
    return;
  }
  const grams = readNumber(foodForm.elements.grams, { positive: true });
  if (Number.isNaN(grams)) return;
  const values = {};
  for (const { key } of metrics) {
    values[key] = readNumber(foodForm.elements[key]);
    if (Number.isNaN(values[key])) return;
  }
  const foods = [...day().foods];
  const isWholePortion = foodForm.elements.basis.value === 'portion';
  const nutrition = isWholePortion ? { values, referenceGrams: grams } : { values };
  foods[editing ?? foods.length] = { name, grams, ...nutrition };
  const presets = editing === null && foodForm.elements.remember.checked
    ? { ...state.presets, [presetKey(name)]: { name, ...nutrition } } : state.presets;
  if (saveDay({ ...day(), foods }, presets)) {
    foodDialog.close();
    render();
    byId('add').focus();
  }
};

byId('remove').onclick = () => {
  if (!window.confirm('Удалить этот продукт из дневника?')) return;
  const foods = day().foods.filter((_, index) => index !== editing);
  if (saveDay({ ...day(), foods })) {
    foodDialog.close();
    render();
    byId('add').focus();
  }
};

byId('settings').onclick = () => {
  for (const { key } of metrics) {
    const { min, max } = state.goals[key];
    goalForm.elements[key + '-min'].value = min;
    goalForm.elements[key + '-max'].value = max ?? '';
  }
  for (const input of goalForm.querySelectorAll('input')) input.setCustomValidity('');
  goalDialog.showModal();
};

goalForm.onsubmit = (event) => {
  event.preventDefault();
  const goals = {};
  for (const { key } of metrics) {
    const upper = goalForm.elements[key + '-max'];
    const min = readNumber(goalForm.elements[key + '-min']);
    if (Number.isNaN(min)) return;
    const max = readNumber(upper, { optional: true });
    if (Number.isNaN(max)) return;
    if (max !== null && max < min) {
      upper.setCustomValidity('Максимум должен быть не меньше минимума.');
      upper.reportValidity();
      return;
    }
    goals[key] = { min, max };
  }
  if (save({ ...state, goals })) {
    goalDialog.close();
    render();
  }
};

byId('details').onsubmit = (event) => {
  event.preventDefault();
  const { weight, note } = event.currentTarget.elements;
  const value = readNumber(weight, { optional: true, positive: true });
  if (Number.isNaN(value)) return;
  if (saveDay({ ...day(), weight: value ?? '', note: note.value.trim() })) {
    byId('details-status').textContent = 'Сохранено';
    render();
  }
};

document.addEventListener('input', ({ target }) => {
  if (target.form === goalForm) {
    for (const input of goalForm.querySelectorAll('input')) input.setCustomValidity('');
  } else if (target instanceof HTMLInputElement) {
    target.setCustomValidity('');
  }
  if (target.form === byId('details')) byId('details-status').textContent = '';
});
for (const button of document.querySelectorAll('[data-close]')) {
  button.onclick = () => button.closest('dialog').close();
}
byId('add').onclick = () => openFood();
byId('previous').onclick = () => shiftDate(-1);
byId('next').onclick = () => shiftDate(1);
byId('today').onclick = () => selectDate(dateKey(new Date()));
byId('date').onchange = ({ target }) => selectDate(target.value || selected);
selectDate(selected);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
