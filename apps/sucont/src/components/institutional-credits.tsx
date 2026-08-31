/**
 * Créditos institucionais do SUCONT-4.
 *
 * Existiam repetidos em seis rotas, ocupando espaço em toda tela de trabalho.
 * O texto tem valor institucional — nomeia a diretriz e as pessoas responsáveis —
 * mas não tem valor de uso diário: ninguém consulta isso enquanto concilia SIAFI
 * com SILOMS. Fica num lugar só, e esse lugar é a documentação.
 */
export function InstitutionalCredits({ className = "" }: { className?: string }) {
	return (
		<section className={`mx-auto max-w-3xl text-center ${className}`}>
			<h2 className="text-label text-muted-foreground mb-3">Uso institucional</h2>
			<p className="text-caption text-muted-foreground leading-relaxed">
				Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int Carlos
				José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO Jefferson Luís Reis
				Alves (Chefe da SUCONT-3.1).
			</p>
		</section>
	)
}
