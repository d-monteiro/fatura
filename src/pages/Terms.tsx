import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">&larr; Voltar</Link>
        <h1 className="mt-6 text-3xl font-bold">Termos de Utilização</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 18 de abril de 2026</p>

        <div className="prose prose-sm mt-8 max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold">1. Aceitação</h2>
            <p>
              Ao criar uma conta no FaturaAI aceita estes Termos e a <Link to="/legal/privacy" className="underline">Política de Privacidade</Link>.
              Se não concordar, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Descrição do serviço</h2>
            <p>
              FaturaAI ajuda empresas a gerir faturas de fornecedores. O serviço extrai automaticamente dados de faturas
              (PDFs e imagens), organiza-os por fornecedor/categoria, e opcionalmente arquiva no Google Drive e exporta
              para Google Sheets.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Conta e utilização</h2>
            <ul className="list-disc pl-6">
              <li>É responsável por manter a segurança das suas credenciais.</li>
              <li>Não pode usar o serviço para atividades ilegais, spam, ou armazenar conteúdo ofensivo.</li>
              <li>Um utilizador representa uma empresa. Partilhar contas entre empresas é violação destes Termos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Período de teste e pagamentos</h2>
            <p>
              Oferecemos 7 dias gratuitos de teste no plano Starter ou Pro. Após esse período, pode escolher continuar
              num plano pago ou cancelar. Sem cartão de crédito durante o teste.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Limites técnicos</h2>
            <ul className="list-disc pl-6">
              <li>Tamanho máximo de ficheiro por upload: 6 MB.</li>
              <li>Formatos aceites: PDF, JPEG, PNG, HEIC, WebP.</li>
              <li>Limite de faturas processadas por mês conforme plano escolhido.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Propriedade intelectual</h2>
            <p>
              Mantém a propriedade das suas faturas e dados. Concede-nos licença limitada para processar esses dados
              apenas para fornecer o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Limitação de responsabilidade</h2>
            <p>
              O serviço é fornecido "tal como está". A extração de dados por IA pode conter erros — é da sua responsabilidade
              validar os dados antes de os usar para efeitos contabilísticos ou fiscais. A nossa responsabilidade máxima
              limita-se ao valor pago nos últimos 12 meses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Cancelamento</h2>
            <p>
              Pode cancelar a qualquer momento nas definições. Após cancelamento, os seus dados são eliminados em 30 dias
              conforme a Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Jurisdição</h2>
            <p>
              Estes Termos são regidos pela lei portuguesa. Qualquer litígio será dirimido pelo foro da comarca de Lisboa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contacto</h2>
            <p><a href="mailto:suporte@flowzi.pt">suporte@flowzi.pt</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
