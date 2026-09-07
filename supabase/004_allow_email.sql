-- Kam — omogoči registracijo za ziga.tomse48@gmail.com
--
-- V projektu (Supabase "TomStudios") je na auth.users sprožilec check_allowed_email(),
-- ki zavrne vsak naslov, ki ni v tabeli public.allowed_emails. Dovolj je vpis vanjo;
-- oseba se nato normalno registrira prek aplikacije (Auth pošlje potrditveni mail).
--
-- Zaženi v SQL Editorju TomStudios projekta.

insert into public.allowed_emails (email)
values ('ziga.tomse48@gmail.com')
on conflict do nothing;

-- preveri
select * from public.allowed_emails where lower(email) = 'ziga.tomse48@gmail.com';
