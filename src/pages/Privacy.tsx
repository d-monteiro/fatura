import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">&larr; Voltar</Link>
        <h1 className="mt-6 text-3xl font-bold">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 18 de abril de 2026</p>

        <div className="prose prose-sm mt-8 max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold">1. Quem somos</h2>
            <p>
              FaturaAI é um serviço operado pela Flowzi Lda., com sede em Portugal.
              Para questões de privacidade contacte <a href="mailto:privacy@flowzi.pt">privacy@flowzi.pt</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Que dados recolhemos</h2>
            <ul className="list-disc pl-6">
              <li><strong>Conta e empresa</strong>: nome, email, NIF, sector, país da empresa.</li>
              <li><strong>Faturas</strong>: ficheiros PDF/imagem carregados por si ou importados de Gmail com os dados extraídos (fornecedor, valores, datas).</li>
              <li><strong>Google APIs</strong> (opt-in, via OAuth): leitura de emails com anexos de faturas (<em>gmail.readonly</em>), criação de pastas e ficheiros no Drive (<em>drive.file</em>), escrita numa folha de cálculo Google Sheets (<em>spreadsheets</em>). Não lemos emails que não tenham anexos de fatura. Não modificamos emails.</li>
              <li><strong>Técnicos</strong>: logs de erros anónimos, endereço IP para rate-limiting.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Finalidade do tratamento</h2>
            <p>
              Usamos os dados exclusivamente para fornecer o serviço: processar as suas faturas, arquivá-las no Drive,
              gerar relatórios. Não vendemos nem partilhamos dados com terceiros para publicidade.
              A utilização de dados provenientes das Google APIs respeita a <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, incluindo os requisitos de <em>Limited Use</em>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Subprocessadores</h2>
            <ul className="list-disc pl-6">
              <li>Supabase (base de dados e autenticação) — Frankfurt, UE.</li>
              <li>OpenRouter / Google Gemini — análise automática de faturas (o documento é enviado para extração de dados; não é usado para treino).</li>
              <li>Vercel — hospedagem da aplicação web.</li>
              <li>Google — Drive / Gmail / Sheets apenas quando autoriza.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Retenção</h2>
            <p>
              As faturas são mantidas enquanto a sua conta estiver ativa. Após cancelamento, os dados são eliminados em 30 dias,
              com excepção de registos contabilísticos exigidos por lei (10 anos em Portugal).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Os seus direitos</h2>
            <p>
              Tem direito de acesso, rectificação, apagamento, limitação e portabilidade dos seus dados pessoais,
              ao abrigo do RGPD. Pode exercê-los contactando <a href="mailto:privacy@flowzi.pt">privacy@flowzi.pt</a>.
              Também pode revogar a ligação Google a qualquer momento em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Segurança</h2>
            <p>
              Todos os dados em trânsito são cifrados com TLS. Os tokens OAuth são armazenados com isolamento por tenant.
              O acesso às faturas em storage está restrito ao seu tenant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Cookies</h2>
            <p>
              Usamos apenas cookies essenciais de sessão. Não usamos cookies de publicidade nem de tracking de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Alterações</h2>
            <p>
              Notificaremos alterações materiais por email com pelo menos 14 dias de antecedência.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
