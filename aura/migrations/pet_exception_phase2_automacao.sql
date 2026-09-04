-- Política Pet — fase 2: os textos do desfecho da exceção.
--
-- Ver docs/PET-POLICY.md. Em 02/09 a decisão era NÃO avisar o hóspede
-- automaticamente; em 03/09 mudou: o AURA manda a mensagem e a pousada reforça e
-- explica à mão depois.
--
-- Cria os DOIS templates prontos e as regras DESLIGADAS. Nada sai daqui sem
-- alguém ligar — recusar pet é conversa delicada, e o texto precisa passar pela
-- direção antes de chegar a um hóspede.

BEGIN;

INSERT INTO message_templates (id, "propertyId", name, body, body_en, body_es, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p.id,
  'Pet — exceção aprovada',
  E'Olá, {{guest_name}}! Tudo certo por aqui.\n\n' ||
  E'Analisamos o seu pedido e *autorizamos, em caráter de exceção*, a hospedagem do seu pet na sua estadia de {{checkin_date}} a {{checkout_date}}.\n\n' ||
  E'A autorização vale apenas para estas datas e para a acomodação reservada, e depende do cumprimento da Política Pet e da Política Pet — Exceção que você aceitou no pré-check-in.\n\n' ||
  E'Na chegada vamos assinar juntos o termo de autorização. Qualquer dúvida, é só chamar por aqui. Até breve!',
  E'Hello, {{guest_name}}! Good news.\n\n' ||
  E'We have reviewed your request and *authorized, as an exception*, your pet''s stay from {{checkin_date}} to {{checkout_date}}.\n\n' ||
  E'The authorization applies only to these dates and to the accommodation booked, and depends on compliance with the Pet Policy and the Pet Policy — Exception you accepted at pre-check-in.\n\n' ||
  E'On arrival we will sign the authorization form together. Any questions, just message us here. See you soon!',
  E'¡Hola, {{guest_name}}! Buenas noticias.\n\n' ||
  E'Analizamos su solicitud y *autorizamos, en carácter de excepción*, el alojamiento de su mascota del {{checkin_date}} al {{checkout_date}}.\n\n' ||
  E'La autorización vale solo para estas fechas y para el alojamiento reservado, y depende del cumplimiento de la Política de Mascotas y de la Política de Mascotas — Excepción que aceptó en el pre-check-in.\n\n' ||
  E'A la llegada firmaremos juntos el término de autorización. Cualquier duda, escríbanos por aquí. ¡Hasta pronto!',
  now(), now()
FROM properties p
WHERE COALESCE((p.settings ->> 'acceptsPets')::boolean, false) IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM message_templates t
     WHERE t."propertyId" = p.id AND t.name = 'Pet — exceção aprovada'
  );

-- O texto da recusa evita duas coisas: culpar o hóspede e prometer o que não
-- podemos. Ele diz o que é possível fazer (vir sem o animal) e não repete a
-- ameaça de multa, que saiu da política em 03/09.
INSERT INTO message_templates (id, "propertyId", name, body, body_en, body_es, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p.id,
  'Pet — exceção recusada',
  E'Olá, {{guest_name}}! Obrigado por nos informar sobre o seu pet no pré-check-in — isso ajuda muito.\n\n' ||
  E'Analisamos o pedido com cuidado e, desta vez, *não conseguiremos receber o animal* na sua estadia de {{checkin_date}} a {{checkout_date}}. Nossa Política Pet prevê um animal de até 15 kg por cabana, e a exceção depende do período e da ocupação da pousada.\n\n' ||
  E'Sua hospedagem segue reservada e à sua disposição — o que não conseguimos autorizar é a presença do animal. Se precisar de indicações de hospedagem para pets na região, é só nos chamar que ajudamos a encontrar.\n\n' ||
  E'Ficamos à disposição para conversar.',
  E'Hello, {{guest_name}}! Thank you for telling us about your pet at pre-check-in — it really helps.\n\n' ||
  E'We reviewed your request carefully and, this time, *we will not be able to host the animal* during your stay from {{checkin_date}} to {{checkout_date}}. Our Pet Policy allows one animal of up to 15 kg per cabin, and exceptions depend on the period and on occupancy.\n\n' ||
  E'Your accommodation remains booked and available to you — what we cannot authorize is the animal''s presence. If you need suggestions for pet boarding nearby, just let us know and we will help.\n\n' ||
  E'We are here if you would like to talk.',
  E'¡Hola, {{guest_name}}! Gracias por informarnos sobre su mascota en el pre-check-in — ayuda mucho.\n\n' ||
  E'Analizamos la solicitud con cuidado y, esta vez, *no podremos recibir al animal* en su estadía del {{checkin_date}} al {{checkout_date}}. Nuestra Política de Mascotas permite un animal de hasta 15 kg por cabaña, y la excepción depende del período y de la ocupación.\n\n' ||
  E'Su alojamiento sigue reservado y a su disposición — lo que no podemos autorizar es la presencia del animal. Si necesita indicaciones de hospedaje para mascotas en la región, avísenos y le ayudamos.\n\n' ||
  E'Quedamos a disposición para conversar.',
  now(), now()
FROM properties p
WHERE COALESCE((p.settings ->> 'acceptsPets')::boolean, false) IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM message_templates t
     WHERE t."propertyId" = p.id AND t.name = 'Pet — exceção recusada'
  );

-- As regras nascem DESLIGADAS (active = false). O id da linha é
-- "<propertyId>__<gatilho>", como as demais.
--
-- Nota: `message_templates` NÃO tem a coluna `variables`, apesar de o tipo
-- `MessageTemplate` em types/aura.ts declarar `variables: string[]`. O tipo mente
-- desde sempre; não inventar a coluna aqui.
INSERT INTO automation_rules (id, "propertyId", "triggerEvent", active, "templateId", "delayMinutes", "createdAt", "updatedAt")
SELECT p.id || '__' || g.trigger, p.id, g.trigger, false, t.id, 0, now(), now()
FROM properties p
CROSS JOIN (VALUES
  ('pet_exception_approved', 'Pet — exceção aprovada'),
  ('pet_exception_refused',  'Pet — exceção recusada')
) AS g(trigger, tpl)
JOIN message_templates t ON t."propertyId" = p.id AND t.name = g.tpl
WHERE COALESCE((p.settings ->> 'acceptsPets')::boolean, false) IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM automation_rules r
     WHERE r."propertyId" = p.id AND r."triggerEvent" = g.trigger
  );

COMMIT;
