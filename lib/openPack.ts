// lib/openPack.ts
import { supabase } from './supabase';

export type OpenPackResponse = {
  card: {
    id: string;
    set_id: string;
    make: string;
    model: string;
    year: number | null;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
    image_path: string | null;
  };
  rarity: string;
  cooldown_minutes: number;
};

export async function openPack(packId: string) {
  const { data, error } = await supabase.functions.invoke('open_pack', {
    body: { pack_id: packId },
  });

  if (error) {
    // La function retourne un JSON d’erreur quand cooldown actif
    // error.message contient le texte
    throw new Error(typeof error === 'string' ? error : (error.message ?? 'Pack open failed'));
  }

  return data as OpenPackResponse;
}
