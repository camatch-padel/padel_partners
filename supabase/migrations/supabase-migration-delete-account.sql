-- Fonction RPC permettant à un utilisateur de supprimer son propre compte
-- Requise par Apple App Store et Google Play Store

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Récupérer l'ID de l'utilisateur connecté
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Supprimer le profil (les données liées seront supprimées par CASCADE)
  DELETE FROM public.profiles WHERE id = current_user_id;

  -- Supprimer les push tokens
  DELETE FROM public.push_tokens WHERE user_id = current_user_id;

  -- Supprimer le compte auth
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- Autoriser les utilisateurs authentifiés à appeler cette fonction
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
