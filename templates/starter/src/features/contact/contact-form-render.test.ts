import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from 'playwright';
import type {
  PublicContactForm,
  PublicFormField,
} from '@goodnight-web/server/client';

const types = [
  'text',
  'textarea',
  'tel',
  'url',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
] as const;
const fields: PublicFormField[] = types.map((type, index) => ({
  id: `f_${index}`,
  type,
  required: index % 2 === 0,
  label: { ja: `Japanese label ${index}`, en: `English label ${index}` },
  hint: { ja: `Japanese hint ${index}`, en: `English hint ${index}` },
  placeholder: {
    ja: `Japanese placeholder ${index}`,
    en: `English placeholder ${index}`,
  },
  ...(['select', 'radio', 'checkbox'].includes(type)
    ? {
        options: [
          {
            value: 'first',
            label: { ja: 'Japanese choice', en: 'English choice' },
          },
          {
            value: 'second',
            label: { ja: 'Japanese second', en: 'English second' },
          },
        ],
      }
    : {}),
}));
const form: PublicContactForm = {
  available: true,
  turnstileSiteKey: 'site-key',
  turnstileAction: 'contact',
  honeypotField: 'honeypot',
  version: 1,
  email: { maxLength: 254 },
  fields,
};
const texts = {
  required: 'Required marker',
  optional: 'Optional marker',
  selectPlaceholder: 'Choose one',
  emailLabel: 'Email label',
  emailHint: 'Email hint',
  emailPlaceholder: 'Email placeholder',
};
let browser: Browser;
let page: Page;
let moduleUrl: string;

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [
      new URL('./contact-form-render.ts', import.meta.url).pathname,
    ],
    target: 'browser',
    format: 'esm',
  });
  if (!build.success || !build.outputs[0])
    throw new Error('Could not build renderer');
  moduleUrl = `data:text/javascript;base64,${Buffer.from(await build.outputs[0].arrayBuffer()).toString('base64')}`;
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(async () => {
  await browser?.close();
});

for (const locale of ['ja', 'en'] as const) {
  test(`renders all field types in ${locale}`, async () => {
    const result = await page.evaluate(
      async ({ moduleUrl, form, texts, locale }) => {
        const { renderFields } = await import(moduleUrl);
        const container = document.createElement('div');
        container.textContent = 'Old content';
        const rendered = renderFields(container, form, locale, texts);
        return {
          keys: rendered.map((field: { key: string }) => field.key),
          oldContent: container.textContent?.includes('Old content'),
          email: {
            id: container.querySelector('input[type=email]')?.id,
            name: container
              .querySelector('input[type=email]')
              ?.getAttribute('name'),
            required:
              container.querySelector<HTMLInputElement>('input[type=email]')
                ?.required,
            text: container.children[0]?.textContent,
          },
          fields: form.fields.map((field) => {
            const node = container.querySelector(`#contact-${field.id}`);
            const wrapper = node?.matches('fieldset')
              ? node
              : node?.closest('div.space-y-2');
            const controls = wrapper?.querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >(`[name="${field.id}"]`);
            return {
              text: wrapper?.textContent,
              tag: node?.tagName,
              type: node?.getAttribute('type'),
              ids: Array.from(controls ?? [], (input) => input.id),
              names: Array.from(controls ?? [], (input) => input.name),
              required: Array.from(controls ?? [], (input) => input.required),
              placeholder: node?.getAttribute('placeholder'),
              describedBy: node?.getAttribute('aria-describedby'),
              options: Array.from(
                wrapper?.querySelectorAll('option') ?? [],
                (option) => [option.value, option.textContent],
              ),
            };
          }),
        };
      },
      { moduleUrl, form, texts, locale },
    );
    expect(result.keys).toEqual(['email', ...fields.map((field) => field.id)]);
    expect(result.oldContent).toBe(false);
    expect(result.email).toEqual({
      id: 'contact-email',
      name: 'email',
      required: true,
      text: expect.stringContaining(texts.emailLabel),
    });
    for (const [index, field] of fields.entries()) {
      const actual = result.fields[index]!;
      const group = field.type === 'radio' || field.type === 'checkbox';
      expect(actual.tag).toBe(
        group
          ? 'FIELDSET'
          : field.type === 'textarea'
            ? 'TEXTAREA'
            : field.type === 'select'
              ? 'SELECT'
              : 'INPUT',
      );
      if (actual.tag === 'INPUT') expect(actual.type).toBe(field.type);
      expect(actual.text).toContain(field.label[locale]);
      expect(actual.text).toContain(field.hint![locale]);
      expect(actual.text).toContain(
        field.required ? texts.required : texts.optional,
      );
      expect(actual.describedBy).toBe(`contact-${field.id}-hint`);
      expect(actual.ids).toEqual(
        group
          ? [`contact-${field.id}-0`, `contact-${field.id}-1`]
          : [`contact-${field.id}`],
      );
      expect(actual.names).toEqual(group ? [field.id, field.id] : [field.id]);
      expect(actual.required).toEqual(
        group
          ? [
              field.type === 'radio' && field.required,
              field.type === 'radio' && field.required,
            ]
          : [field.required],
      );
      if (!group && field.type !== 'select')
        expect(actual.placeholder).toBe(field.placeholder![locale]);
      if (field.type === 'select')
        expect(actual.options).toEqual([
          ['', field.placeholder![locale]],
          ['first', field.options![0]!.label[locale]],
          ['second', field.options![1]!.label[locale]],
        ]);
      if (group)
        expect(actual.text).toContain(field.options![0]!.label[locale]);
    }
  });
}

test('renders untrusted definitions as text and falls back to the other language', async () => {
  const payload = `<img src=x onerror="alert('x')"> & 'quoted'`;
  const result = await page.evaluate(
    async ({ moduleUrl, form, texts, payload }) => {
      const { renderFields, localized } = await import(moduleUrl);
      const container = document.createElement('div');
      const value = { ja: '', en: payload };
      const modified = {
        ...form,
        fields: form.fields.map((field) => ({
          ...field,
          label: value,
          hint: value,
          placeholder: value,
          options: field.options?.map((option) => ({
            ...option,
            label: value,
            value: payload,
          })),
        })),
      };
      renderFields(container, modified, 'ja', texts);
      return {
        injected: container.querySelectorAll('img, script, [onerror]').length,
        text: container.textContent,
        placeholders: Array.from(
          container.querySelectorAll<HTMLInputElement>(
            'input[placeholder], textarea[placeholder]',
          ),
          (node) => node.placeholder,
        ),
        options: Array.from(container.querySelectorAll('option'), (node) => [
          node.textContent,
          node.value,
        ]),
        localized: [
          localized(undefined, 'ja'),
          localized({ ja: 'Japanese', en: '' }, 'en'),
        ],
      };
    },
    { moduleUrl, form, texts, payload },
  );
  expect(result.injected).toBe(0);
  expect(result.text).toContain(payload);
  expect(
    result.placeholders.every(
      (value) => value === payload || value === texts.emailPlaceholder,
    ),
  ).toBe(true);
  expect(result.options).toContainEqual([payload, payload]);
  expect(result.localized).toEqual(['', 'Japanese']);
});

test('preserves values and handles errors and empty choices', async () => {
  const result = await page.evaluate(
    async ({ moduleUrl, form, texts }) => {
      const { renderFields } = await import(moduleUrl);
      const container = document.createElement('div');
      const choices = form.fields
        .filter((field) => ['select', 'radio', 'checkbox'].includes(field.type))
        .map((field) => ({ ...field, required: true }));
      const keep = new Map<string, string | string[]>([
        ['email', 'visitor@example.com'],
        [choices[0]!.id, 'second'],
        [choices[1]!.id, 'first'],
        [choices[2]!.id, ['first', 'second']],
      ]);
      const rendered = renderFields(
        container,
        { ...form, fields: choices },
        'en',
        texts,
        keep,
      );
      const values = rendered.map((field: { read(): unknown }) => field.read());
      const group = rendered[2];
      group.setError('required', 'Please choose');
      const marked = [
        group.focusTarget.closest('fieldset')?.getAttribute('aria-invalid'),
        group.focusTarget.closest('fieldset')?.getAttribute('aria-describedby'),
        container.textContent?.includes('Please choose'),
      ];
      group.setError(null, '');
      const cleared = [
        group.focusTarget.closest('fieldset')?.getAttribute('aria-invalid'),
        group.focusTarget.closest('fieldset')?.getAttribute('aria-describedby'),
        container.textContent?.includes('Please choose'),
      ];
      const empty = renderFields(
        container,
        {
          ...form,
          fields: choices.map((field) => ({
            ...field,
            options: [],
            placeholder: undefined,
          })),
        },
        'en',
        texts,
      );
      return {
        values,
        marked,
        cleared,
        emptyValues: empty
          .slice(1)
          .map((field: { read(): unknown }) => field.read()),
        validation: empty
          .slice(1)
          .map((field: { validate(): unknown }) => field.validate()),
        focus: empty
          .slice(1)
          .map(
            (field: { focusTarget: HTMLElement }) => field.focusTarget.tagName,
          ),
        selectText: container.querySelector('select')?.textContent,
      };
    },
    { moduleUrl, form, texts },
  );
  expect(result.values).toEqual([
    'visitor@example.com',
    'second',
    'first',
    ['first', 'second'],
  ]);
  expect(result.marked).toEqual([
    'true',
    `contact-${fields[6]!.id}-hint contact-${fields[6]!.id}-error`,
    true,
  ]);
  expect(result.cleared).toEqual([
    'false',
    `contact-${fields[6]!.id}-hint`,
    false,
  ]);
  expect(result.emptyValues).toEqual(['', '', []]);
  expect(result.validation).toEqual(['required', 'required', 'required']);
  expect(result.focus).toEqual(['SELECT', 'FIELDSET', 'FIELDSET']);
  expect(result.selectText).toBe(texts.selectPlaceholder);
});
