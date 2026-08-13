# Permission model

All permissions bind the requesting `X-Hasura-User-Id` to an `org_members` row **and** to the appropriate membership role. The role header is therefore not trusted: a viewer who sends `x-hasura-role: owner` still matches no `role = owner` membership row and gets no rows.

The metadata below uses this Hasura condition for every org-scoped table, replacing `<table>` and `<role>`:

```yaml
_exists:
  _table: {schema: public, name: org_members}
  _where:
    _and:
      - {user_id: {_eq: X-Hasura-User-Id}}
      - {role: {_eq: <role>}}
      - {org_id: {_eq: <table>.org_id}}
```

`owner` gets CRUD. `editor` gets reads plus workflow/step/trigger edits, with an insert/update check that rejects `db_write` and `notify` steps and `webhook` triggers. `viewer` gets only reads. Action handlers repeat membership checks with the admin secret, so direct Action calls cannot bypass either layer.
