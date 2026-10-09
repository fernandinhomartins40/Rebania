import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronRight,

  MapPin,
  Menu,
  Monitor,
  Package,
  Settings2,
  Smartphone,
  Sparkles,
  Syringe,
  Tag,
  Users,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { BrandCow } from "../../components/brand.tsx";
import copy from "./copy.json";
import "./landing.css";

/**
 * Landing pública (T01). Fonte de verdade da copy: copy.json do pacote de marca
 * (docs/brand/pacote-landing). Prévias de interface são HTML/CSS rotuladas como
 * "Tela ilustrativa"; nenhum número aqui é dado real de fazenda.
 */

function Photo({ name, alt, widths, sizes, className, eager }: { name: string; alt: string; widths: number[]; sizes: string; className?: string; eager?: boolean }) {
  const max = widths[widths.length - 1]!;
  return (
    <img
      className={className}
      src={`/img/${name}-${max >= 1200 ? 1200 : max}.webp`}
      srcSet={widths.map((w) => `/img/${name}-${w}.webp ${w}w`).join(", ")}
      sizes={sizes}
      alt={alt}
      width={1536}
      height={1024}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...(eager ? { fetchPriority: "high" as const } : {})}
    />
  );
}

const Illustrative = () => <span className="lp-illustrative">{copy.previewLabel}</span>;

const BENEFIT_ICONS: LucideIcon[] = [Tag, Users, CalendarDays];
const BENEFIT_DESC = [
  "Do nascimento à venda, com tudo registrado.",
  "Ganhe escala e organize sua rotina.",
  "Próximos manejos visíveis para a equipe.",
];
const RESOURCE_ICONS: (LucideIcon | "cow")[] = ["cow", Syringe, Weight, MapPin, Package];
const RESOURCE_DESC = [
  "Ciclo completo e controle reprodutivo.",
  "Calendário e histórico de aplicações.",
  "Acompanhe o desenvolvimento.",
  "Organize por lotes e áreas de pastejo.",
  "Insumos, custos e movimentações.",
];
const CONTRACT_ICONS: LucideIcon[] = [Settings2, ChartNoAxesColumn, Sparkles];
const CHANNEL_ICONS: LucideIcon[] = [Monitor, Smartphone, Smartphone];

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const nav = [
    { label: copy.navigation[0], href: "#como-funciona" },
    { label: copy.navigation[1], href: "#recursos" },
    { label: copy.navigation[2], href: "#inteligencia" },
    { label: copy.navigation[3], href: "#contratacao" },
  ];
  const [h1a, h1b] = copy.hero.title.split(". ");

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a href="#topo" aria-label="Rebania — início">
            <img className="lp-logo" src="/brand/rebania-logo.png" alt="Rebania — Sua fazenda em dia." width={170} height={57} />
          </a>
          <button type="button" className="lp-menu-btn" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((v) => !v)}>
            {menu ? <X size={26} aria-hidden="true" /> : <Menu size={26} aria-hidden="true" />}
            <span className="visually-hidden">Menu</span>
          </button>
          <nav id="lp-menu" className={`lp-links ${menu ? "open" : ""}`} aria-label="Seções">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenu(false)}>{n.label}</a>
            ))}
            <Link to="/entrar" className="lp-enter">Entrar</Link>
            <a href={copy.destinations.primary} className="lp-btn" onClick={() => setMenu(false)}>{copy.hero.primary}</a>
          </nav>
        </div>
      </header>

      <main id="topo">
        {/* Hero */}
        <section className="lp-container lp-hero">
          <div className="lp-hero-copy">
            <h1>
              {h1a}.<br />
              {h1b}
            </h1>
            <p className="lp-lead">{copy.hero.body}</p>
            <div className="lp-actions">
              <a href={copy.destinations.primary} className="lp-btn">{copy.hero.primary}</a>
              <a href={copy.destinations.secondary} className="lp-btn secondary">{copy.hero.secondary}</a>
            </div>
            <p className="lp-status">{copy.status}.</p>
          </div>
          <div className="lp-hero-visual">
            <Photo className="lp-photo lp-photo-hero" name="hero-rancher" alt="Pecuarista consultando o celular junto ao rebanho" widths={[480, 768, 1200, 1536]} sizes="(min-width: 1024px) 50vw, 100vw" eager />
            <div className="lp-preview lp-hero-card" aria-label="Exemplo de painel (tela ilustrativa)">
              <div className="lp-preview-head">
                <img src="/brand/rebania-logo.png" alt="" className="lp-preview-logo" />
                <Illustrative />
              </div>
              <div className="lp-metrics">
                {[["1.248", "Animais"], ["42", "Lotes"], ["28", "Manejos pendentes"], ["12", "Tarefas de hoje"]].map(([n, l]) => (
                  <div key={l}><strong>{n}</strong><span>{l}</span></div>
                ))}
              </div>
              <div className="lp-preview-sub"><strong>Próximas tarefas</strong></div>
              <ul className="lp-tasks">
                <li><span className="dot red" />Vacinação · Lote 12<span className="chip red">Hoje</span></li>
                <li><span className="dot ochre" />Pesagem · Recria<span className="chip ochre">Amanhã</span></li>
                <li><span className="dot ochre" />Revisar pasto · Área Sul<span className="chip">12/04</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Benefícios */}
        <section className="lp-band sage">
          <div className="lp-container">
            <h2 className="center">{copy.benefits.title}</h2>
            <ul className="lp-three lp-benefits">
              {copy.benefits.items.map((t, i) => {
                const Ic = BENEFIT_ICONS[i]!;
                return (
                  <li key={t}>
                    <Ic size={40} aria-hidden="true" />
                    <div><h3>{t}</h3><p>{BENEFIT_DESC[i]}</p></div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Três etapas */}
        <section className="lp-band green" id="como-funciona">
          <div className="lp-container">
            <h2 className="center">{copy.steps.title}</h2>
            <ol className="lp-three lp-steps">
              {copy.steps.items.map((s, i) => (
                <li key={s.title}>
                  <span className="n" aria-hidden="true">{i + 1}</span>
                  <div><h3>{s.title}</h3><p>{s.body}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Recursos */}
        <section className="lp-container lp-section lp-split" id="recursos">
          <div>
            <h2>{copy.resources.title.split(". ")[0]}.<br />{copy.resources.title.split(". ")[1]}</h2>
            <article className="lp-preview lp-passport" aria-label="Exemplo de ficha do animal (tela ilustrativa)">
              <div className="lp-preview-head">
                <img src="/brand/rebania-logo.png" alt="" className="lp-preview-logo" />
                <span className="lp-preview-title">Ficha do animal</span>
                <Illustrative />
              </div>
              <div className="lp-passport-body">
                <Photo className="lp-photo lp-photo-animal" name="animal-history" alt="Animal Nelore com brinco de identificação" widths={[480, 768]} sizes="(min-width: 1024px) 240px, 40vw" />
                <div>
                  <strong className="lp-animal-name">BRN 3487</strong>
                  <span className="lp-muted">Nelore · Macho · 24 meses</span>
                  <ol className="lp-timeline">
                    <li><strong>Nascimento</strong><span>Registro de nascimento</span></li>
                    <li><strong>Vacinação</strong><span>Aplicação registrada</span></li>
                    <li><strong>Pesagem</strong><span>486 kg</span></li>
                  </ol>
                </div>
              </div>
            </article>
          </div>
          <ul className="lp-resources">
            {copy.resources.items.map((t, i) => {
              const Ic = RESOURCE_ICONS[i]!;
              return (
                <li key={t}>
                  <span className="ic">{Ic === "cow" ? <BrandCow size={28} /> : <Ic size={26} aria-hidden="true" />}</span>
                  <div><strong>{t}</strong><span>{RESOURCE_DESC[i]}</span></div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Histórico */}
        <section className="lp-container lp-section lp-split">
          <Photo className="lp-photo lp-photo-animal" name="animal-history" alt="Animal Nelore com brinco de identificação no pasto" widths={[480, 768, 1200, 1536]} sizes="(min-width: 1024px) 50vw, 100vw" />
          <div>
            <h2>{copy.history.title}</h2>
            <p className="lp-lead">{copy.history.body}</p>
            <ol className="lp-history">
              {copy.history.items.map((t, i) => (
                <li key={t}>
                  <Photo className="lp-thumb" name="animal-history" alt="" widths={[480]} sizes="96px" />
                  <div>
                    <strong>{t}</strong>
                    <span>{["Registro de nascimento e identificação.", "Cobertura registrada no lote de matrizes.", "486 kg desde a última pesagem."][i]}</span>
                  </div>
                </li>
              ))}
            </ol>
            <Illustrative />
          </div>
        </section>

        {/* Assistente */}
        <section className="lp-band sage" id="inteligencia">
          <div className="lp-container lp-assistant">
            <div>
              <h2>{copy.assistant.title}</h2>
              <p className="lp-lead">{copy.assistant.body}</p>
            </div>
            <div className="lp-chat" aria-label="Exemplo de conversa (tela ilustrativa)">
              <p className="bubble q"><img src="/brand/rebania-symbol.png" alt="" />{copy.assistant.question}</p>
              <p className="bubble a">{copy.assistant.response}</p>
              <p className="bubble q"><img src="/brand/rebania-symbol.png" alt="" />{copy.assistant.control}</p>
              <Illustrative />
            </div>
            <Photo className="lp-photo lp-photo-hero lp-assistant-photo" name="hero-rancher" alt="" widths={[480, 768]} sizes="(min-width: 1024px) 280px, 100vw" />
          </div>
        </section>

        {/* Plataformas */}
        <section className="lp-container lp-section">
          <h2>{copy.platforms.title}</h2>
          <div className="lp-devices">
            <figure className="lp-device desktop">
              <div className="screen">
                <img src="/brand/rebania-logo.png" alt="" className="lp-preview-logo" />
                <strong>Animais</strong>
                <table>
                  <thead><tr><th>ID</th><th>Lote</th><th>Peso</th></tr></thead>
                  <tbody>
                    <tr><td>BRN 3487</td><td>Lote 12</td><td>486 kg</td></tr>
                    <tr><td>BRN 3521</td><td>Lote 12</td><td>512 kg</td></tr>
                    <tr><td>BRN 3590</td><td>Lote 08</td><td>298 kg</td></tr>
                  </tbody>
                </table>
              </div>
              <figcaption><Monitor size={20} aria-hidden="true" /> {copy.platforms.channels[0]}</figcaption>
            </figure>
            {[1, 2].map((i) => {
              const Ic = CHANNEL_ICONS[i]!;
              return (
                <figure className="lp-device phone" key={i}>
                  <div className="screen">
                    <img src="/brand/rebania-logo.png" alt="" className="lp-preview-logo" />
                    <strong>{i === 1 ? "Visão geral" : "Animais"}</strong>
                    {i === 1 ? (
                      <div className="lp-metrics small"><div><strong>1.248</strong><span>Animais</span></div><div><strong>28</strong><span>Manejos</span></div></div>
                    ) : (
                      <ul className="lp-mini-list">
                        {["BRN 3487", "BRN 3521", "BRN 3590"].map((n) => (
                          <li key={n}><Photo className="lp-thumb sm" name="animal-history" alt="" widths={[480]} sizes="40px" />{n}<ChevronRight size={16} aria-hidden="true" /></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <figcaption><Ic size={20} aria-hidden="true" /> {copy.platforms.channels[i]}</figcaption>
                </figure>
              );
            })}
            <div className="lp-devices-note">
              <p>{copy.platforms.body}</p>
              <p className="lp-muted small">{copy.platforms.note}</p>
              <Illustrative />
            </div>
          </div>
        </section>

        {/* Contratação */}
        <section className="lp-container lp-section" id="contratacao">
          <h2>{copy.contract.title}</h2>
          <ul className="lp-three lp-contract">
            {copy.contract.items.map((c, i) => {
              const Ic = CONTRACT_ICONS[i]!;
              return (
                <li key={c.title}>
                  <Ic size={34} aria-hidden="true" />
                  <div><h3>{c.title}</h3><p>{c.body}</p></div>
                </li>
              );
            })}
          </ul>
          <p className="center lp-muted">{copy.contract.note}</p>
        </section>

        {/* FAQ */}
        <section className="lp-container lp-section">
          <h2>{copy.faq.title}</h2>
          <div className="lp-faq">
            {copy.faq.items.map((f, i) => (
              <details key={f.question} open={i === 1}>
                <summary>{f.question}<ChevronDown size={20} aria-hidden="true" /></summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <Photo className="lp-cta-bg" name="pasture-cta" alt="" widths={[768, 1200, 1536, 2172]} sizes="100vw" />
          <div className="lp-container lp-cta-inner">
            <h2>{copy.closing.title.split(". ")[0]}.<br />{copy.closing.title.split(". ")[1]}</h2>
            <a href={copy.destinations.primary} className="lp-btn light">{copy.closing.button} <ArrowRight size={20} aria-hidden="true" /></a>
          </div>
        </section>

        {/* Demonstração */}
        <section className="lp-container lp-section" id="demonstracao">
          <h2>{copy.form.title}</h2>
          <form onSubmit={(e) => e.preventDefault()} aria-describedby="lp-form-note">
            <fieldset disabled className="lp-form">
              <legend className="visually-hidden">Solicitar contato</legend>
              <label>{copy.form.labels[0]}<input name="name" autoComplete="name" /></label>
              <label>{copy.form.labels[1]}<input name="email" type="email" autoComplete="email" /></label>
              <label>
                {copy.form.labels[2]}
                <select name="profile" defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {copy.form.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
              <button type="submit" className="lp-btn">{copy.form.button}</button>
            </fieldset>
            <p id="lp-form-note" className="lp-muted small">{copy.form.previewNote} Os campos ainda não enviam dados.</p>
          </form>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <img src="/brand/rebania-logo.png" alt="Rebania — Sua fazenda em dia." className="lp-logo" width={170} height={57} />
          <nav aria-label="Rodapé">
            <a href="#recursos">Recursos</a>
            <a href="#contratacao">Contratação</a>
            <Link to="/entrar">Entrar</Link>
          </nav>
          <p className="lp-muted small">{copy.brand} · {copy.status} · Telas ilustrativas</p>
        </div>
      </footer>
    </div>
  );
}

