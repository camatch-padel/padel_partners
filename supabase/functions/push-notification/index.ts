// Edge Function : envoyer une push notification via Expo Push API
// Déclenchée par un Database Webhook sur INSERT dans la table notifications

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, any> | null;
    is_read: boolean;
    created_at: string;
  };
}

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();
    const { record } = payload;

    // Créer un client Supabase avec la service_role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Récupérer le push token de l'utilisateur
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', record.user_id)
      .single();

    if (!profile?.expo_push_token) {
      return new Response(JSON.stringify({ message: 'Pas de push token' }), {
        status: 200,
      });
    }

    // Construire l'URL de deep link si disponible
    const pushData: Record<string, any> = {};
    if (record.data?.match_id) {
      pushData.url = `/my-match/${record.data.match_id}`;
    } else if (record.data?.tournament_id) {
      pushData.url = `/my-tournament/${record.data.tournament_id}`;
    } else if (record.data?.group_id) {
      pushData.url = `/group/${record.data.group_id}`;
    }

    // Envoyer la push notification via Expo
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: record.title,
        body: record.body,
        data: pushData,
        sound: 'default',
        priority: 'high',
      }),
    });

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
