import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rbmfidmnomqyzgvlqome.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_nQQMzbntNL2Bu346iW0HhQ_JVkilrE_'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)