-- Kam — ročno ustvari uporabniški račun (potrjena e-pošta, brez potrditvenega
-- maila). Zaženi v Supabase SQL Editor projekta TomStudios.
--
-- Najprej v spodnji vrstici zamenjaj 'ZAMENJAJ_GESLO' z izbranim geslom
-- (vsaj 6 znakov). Uporabnik se nato lahko takoj prijavi s to e-pošto in geslom.
--
-- Opomba: preprostejša pot je Dashboard -> Authentication -> Users -> "Add user"
-- (obkljukaj "Auto Confirm User"). Ta skripta je za primer, ko tega nočeš/ne moreš.

do $$
declare
  v_email text := 'ziga.tomse48@gmail.com';
  v_pass  text := 'ZAMENJAJ_GESLO';
  v_id    uuid;
begin
  -- pgcrypto (crypt/gen_salt) — v Supabase je privzeto v shemi extensions
  create extension if not exists pgcrypto with schema extensions;

  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_email,
      extensions.crypt(v_pass, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(), now(), now()
    );

    raise notice 'Ustvarjen uporabnik % (id %)', v_email, v_id;
  else
    -- že obstaja: samo potrdi e-pošto in nastavi novo geslo
    update auth.users
       set encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
    raise notice 'Uporabnik % je že obstajal — posodobljeno geslo in potrjena e-pošta (id %)', v_email, v_id;
  end if;
end $$;
