import { AuthError } from '@supabase/supabase-js';

export interface AuthErrorInfo {
  message: string;
  level: 'warn' | 'error';
}

const USER_FACING_CODES: Record<string, string> = {
  invalid_credentials: 'Email ou palavra-passe incorretos.',
  email_not_confirmed: 'Tens de confirmar o teu email antes de entrar. Verifica a tua caixa de entrada (e a pasta de spam).',
  user_already_exists: 'Já existe uma conta com este email. Tenta entrar em vez de criar conta nova.',
  email_exists: 'Já existe uma conta com este email. Tenta entrar em vez de criar conta nova.',
  weak_password: 'Palavra-passe demasiado fraca. Usa pelo menos 6 caracteres.',
  user_not_found: 'Não encontrámos nenhuma conta com este email.',
  over_email_send_rate_limit: 'Enviámos demasiados emails para este endereço. Aguarda alguns minutos antes de tentar novamente.',
  over_request_rate_limit: 'Demasiadas tentativas num curto espaço de tempo. Aguarda um pouco e tenta outra vez.',
  email_address_invalid: 'O email introduzido não parece válido. Verifica se está bem escrito.',
  signup_disabled: 'O registo de novas contas está temporariamente desativado.',
  email_provider_disabled: 'Autenticação por email está desativada neste momento.',
  same_password: 'A nova palavra-passe tem de ser diferente da atual.',
  session_expired: 'A tua sessão expirou. Volta a entrar, por favor.',
};

export function translateAuthError(err: unknown): AuthErrorInfo {
  if (err instanceof AuthError) {
    const code = err.code;
    if (code && code in USER_FACING_CODES) {
      return { message: USER_FACING_CODES[code], level: 'warn' };
    }
    if (err.status === 429) {
      return { message: USER_FACING_CODES.over_request_rate_limit, level: 'warn' };
    }
    if (err.status && err.status >= 500) {
      return {
        message: 'O serviço de autenticação está indisponível neste momento. Tenta novamente dentro de momentos.',
        level: 'error',
      };
    }
    return {
      message: 'Não conseguimos completar o pedido. Tenta de novo; se persistir, contacta o suporte.',
      level: 'error',
    };
  }

  if (err instanceof Error) {
    return {
      message: 'Ocorreu um erro inesperado. Tenta de novo; se persistir, contacta o suporte.',
      level: 'error',
    };
  }

  return {
    message: 'Ocorreu um erro inesperado. Tenta de novo; se persistir, contacta o suporte.',
    level: 'error',
  };
}
