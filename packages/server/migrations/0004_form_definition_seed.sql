-- Custom migration (drizzle-kit generate --custom): the contact form
-- definition.
--
-- 1. Version 1 of the form: the fields the contact form had before they
--    became editable in the admin UI. The ids `f_name`, `f_company`,
--    `f_phone`, `f_category`, and `f_message` are fixed here; fields added
--    later get random ids from the server.
-- 2. Existing submissions: copy the old columns into `fields` (keyed by
--    those ids) and mark them as version 1. json_patch() leaves out the
--    columns that are NULL. migrations/0005 then drops the old columns.
-- 3. Triggers that keep form_definitions append-only, so a saved version
--    never changes. drizzle-kit does not track triggers: if a later
--    migration recreates `form_definitions`, it must create them again.
--
-- Released migration files are never edited; add a new one instead.
INSERT INTO `form_definitions` (`version`, `definition`, `created_at`, `created_by`, `restored_from`)
VALUES (1, json('{
  "fields": [
    {
      "id": "f_name",
      "type": "text",
      "label": {
        "ja": "お名前",
        "en": "Name"
      },
      "placeholder": {
        "ja": "青木 蒼",
        "en": "Maya Brooks"
      },
      "required": true,
      "maxLength": 100,
      "showInList": true
    },
    {
      "id": "f_company",
      "type": "text",
      "label": {
        "ja": "会社名・団体名",
        "en": "Company or organization"
      },
      "required": false,
      "maxLength": 200,
      "showInList": true
    },
    {
      "id": "f_phone",
      "type": "tel",
      "label": {
        "ja": "電話番号",
        "en": "Phone"
      },
      "placeholder": {
        "ja": "03-0000-0000",
        "en": "03-0000-0000"
      },
      "hint": {
        "ja": "お電話でのご連絡をご希望の場合にご記入ください。",
        "en": "Fill this in if you would like us to call you."
      },
      "required": false,
      "maxLength": 40,
      "showInList": false
    },
    {
      "id": "f_category",
      "type": "select",
      "label": {
        "ja": "お問い合わせの種類",
        "en": "Category"
      },
      "placeholder": {
        "ja": "選択してください",
        "en": "Select a category"
      },
      "required": true,
      "showInList": false,
      "options": [
        {
          "value": "service",
          "label": {
            "ja": "サービスについて",
            "en": "Services"
          }
        },
        {
          "value": "press",
          "label": {
            "ja": "取材について",
            "en": "Press"
          }
        },
        {
          "value": "recruit",
          "label": {
            "ja": "採用について",
            "en": "Careers"
          }
        },
        {
          "value": "sales",
          "label": {
            "ja": "営業・ご提案",
            "en": "Business proposal"
          }
        },
        {
          "value": "other",
          "label": {
            "ja": "その他",
            "en": "Other"
          }
        }
      ]
    },
    {
      "id": "f_message",
      "type": "textarea",
      "label": {
        "ja": "お問い合わせ内容",
        "en": "Message"
      },
      "hint": {
        "ja": "5,000文字まで入力できます。",
        "en": "Up to 5,000 characters."
      },
      "required": true,
      "maxLength": 5000,
      "showInList": true
    }
  ],
  "archived": []
}'), CAST(strftime('%s', 'now') AS INTEGER) * 1000, NULL, NULL);
--> statement-breakpoint
UPDATE `submissions` SET
  `fields` = json_patch('{}', json_object(
    'f_name', `name`,
    'f_company', `company`,
    'f_phone', `phone`,
    'f_category', `category`,
    'f_message', `body`
  )),
  `form_version` = 1;
--> statement-breakpoint
CREATE TRIGGER `form_definitions_no_update` BEFORE UPDATE ON `form_definitions`
BEGIN
  SELECT RAISE(ABORT, 'form_definitions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `form_definitions_no_delete` BEFORE DELETE ON `form_definitions`
BEGIN
  SELECT RAISE(ABORT, 'form_definitions is append-only');
END;
