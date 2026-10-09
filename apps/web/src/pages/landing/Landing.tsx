import {
  Activity,
  CalendarDays,
  ChartColumnIncreasing,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Map as MapIcon,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Syringe,
  Table2,
  Tag,
  User,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BrandCow } from "../../components/brand.tsx";
import copy from "./copy.json";
import "./landing.css";

/**
 * Landing pública (T01). Composição: pranchas desktop, tablet e mobile de
 * docs/brand/pacote-responsivo; textos em copy.json. Prévias de interface são
 * HTML/CSS rotuladas como "Tela ilustrativa"; nenhum número aqui é dado real.
 */

function Photo({
  name,
  alt,
  widths,
  sizes,
  className,
  eager,
}: {
  name: string;
  alt: string;
  widths: number[];
  sizes: string;
  className?: string;
  eager?: boolean;
}) {
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
/** Marca compacta das prévias: símbolo + wordmark oficiais (PNG), sem tagline. */
const MiniLogo = () => (
  <span className="lp-preview-logo">
    <img src="/brand/rebania-symbol.png" alt="" />
    <img src="/brand/rebania-wordmark.png" alt="" />
  </span>
);

/** Divide "Frase um. Frase dois." em duas linhas, como nas pranchas. */
function TwoLines({ text }: { text: string }) {
  const [a, b] = text.split(". ");
  return b ? (
    <>
      {a}.<br />
      {b}
    </>
  ) : (
    <>{text}</>
  );
}

/**
 * Título do hero: uma frase por linha no celular; a partir do tablet cada frase
 * quebra após as duas primeiras palavras ("Sua fazenda / em dia."), como nas pranchas.
 */
function HeroTitle({ text }: { text: string }) {
  const sentences = text.split(/(?<=\.)\s+/);
  return (
    <>
      {sentences.map((sentence, i) => {
        const words = sentence.split(" ");
        return (
          <span key={sentence}>
            {i > 0 && <br />}
            {words.slice(0, 2).join(" ")}
            <br className="lp-br-wide" /> {words.slice(2).join(" ")}
          </span>
        );
      })}
    </>
  );
}

const BENEFIT_ICONS: LucideIcon[] = [Tag, Users, CalendarDays];
const RESOURCE_ICONS: (LucideIcon | "cow")[] = [
  "cow",
  Syringe,
  ShoppingBag,
  MapIcon,
  ClipboardList,
];
const CONTRACT_ICONS: LucideIcon[] = [Settings, ChartColumnIncreasing, Star];

const TASKS = [
  { label: "Vacinação - Lote 12", tone: "red", chip: "Hoje" },
  { label: "Pesagem - Recria", tone: "ochre", chip: "Amanhã" },
  { label: "Revisar pasto - Área Sul", tone: "leaf", chip: "12/04" },
];
const PASSPORT_EVENTS = [
  { title: "Nascimento", body: "Registro de nascimento", date: "12/04/2022" },
  { title: "Vacinação", body: "Aftosa e clostridioses", date: "18/08/2023" },
  { title: "Pesagem", body: "486 kg (ganho de 56 kg)", date: "10/02/2024" },
];
const HERD = [
  { id: "BRN 3487", lot: "Lote 12", kg: "486 kg", status: "Ativo", age: "24 meses" },
  { id: "BRN 3521", lot: "Lote 12", kg: "512 kg", status: "Ativo", age: "30 meses" },
  { id: "BRN 3600", lot: "Lote 08", kg: "298 kg", status: "Recria", age: "14 meses" },
  { id: "BRN 3612", lot: "Lote 08", kg: "310 kg", status: "Recria", age: "15 meses" },
];
const WEB_MENU: [LucideIcon, string][] = [
  [LayoutDashboard, "Visão geral"],
  [Tag, "Animais"],
  [MapIcon, "Lotes e pastos"],
  [Activity, "Manejos"],
  [CalendarDays, "Agenda"],
  [Package, "Financeiro"],
];

function TaskList({ compact }: { compact?: boolean }) {
  return (
    <ul className={`lp-tasks ${compact ? "compact" : ""}`}>
      {TASKS.map((t) => (
        <li key={t.label}>
          <span className={`dot ${t.tone}`} />
          {t.label}
          <span className={`chip ${t.tone}`}>{t.chip}</span>
        </li>
      ))}
    </ul>
  );
}

function WebDevice() {
  return (
    <div className="lp-laptop" aria-hidden="true">
      <div className="lp-laptop-screen">
        <aside>
          <MiniLogo />
          <ul>
            {WEB_MENU.map(([Ic, l], i) => (
              <li key={l} className={i === 0 ? "on" : ""}>
                <Ic size={10} strokeWidth={1.8} />
                {l}
              </li>
            ))}
          </ul>
        </aside>
        <div className="lp-laptop-main">
          <strong>Animais</strong>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Lote</th>
                <th>Peso</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {HERD.map((h) => (
                <tr key={h.id}>
                  <td>{h.id}</td>
                  <td>{h.lot}</td>
                  <td>{h.kg}</td>
                  <td>
                    <span className={`chip ${h.status === "Ativo" ? "leaf" : "ochre"}`}>
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="lp-laptop-base" />
    </div>
  );
}

function PhoneOverview() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">
        <div className="lp-phone-head">
          <MiniLogo />
          <X size={12} />
        </div>
        <span className="lp-phone-title">Visão geral</span>
        <div className="lp-phone-metric">
          <strong>1.248</strong>
          <span>Animais</span>
        </div>
        <div className="lp-phone-metric">
          <strong>28</strong>
          <span>Manejos pendentes</span>
        </div>
        <span className="lp-phone-sub">Próximas tarefas</span>
        <TaskList compact />
      </div>
    </div>
  );
}

function PhoneHerd() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">
        <div className="lp-phone-head">
          <MiniLogo />
          <X size={12} />
        </div>
        <span className="lp-phone-title">Animais</span>
        <ul className="lp-mini-list">
          {HERD.slice(0, 3).map((h) => (
            <li key={h.id}>
              <Photo
                className="lp-thumb sm"
                name="animal-history"
                alt=""
                widths={[480]}
                sizes="40px"
              />
              <span>
                <strong>{h.id}</strong>
                <small>Nelore • {h.age}</small>
              </span>
              <ChevronRight size={12} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** true abaixo de 768px (pranchas mobile). */
function useIsMobile() {
  const query = "(max-width: 767px)";
  const [mobile, setMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const mobile = useIsMobile();
  const nav = [
    { label: copy.navigation[0], href: "#como-funciona" },
    { label: copy.navigation[1], href: "#recursos" },
    { label: copy.navigation[2], href: "#inteligencia" },
    { label: copy.navigation[3], href: "#contratacao" },
  ];
  const [faqFirst, ...faqRest] = copy.faq.items;
  const formIcons: LucideIcon[] = [User, Mail, Table2];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a href="#topo" aria-label="Rebania — início">
            <img
              className="lp-logo"
              src="/brand/rebania-logo.png"
              alt="Rebania — Sua fazenda em dia."
              width={170}
              height={57}
            />
          </a>
          <button
            type="button"
            className="lp-menu-btn"
            aria-expanded={menu}
            aria-controls="lp-menu"
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X size={30} aria-hidden="true" /> : <Menu size={30} aria-hidden="true" />}
            <span className="visually-hidden">Menu</span>
          </button>
          <nav id="lp-menu" className={`lp-links ${menu ? "open" : ""}`} aria-label="Seções">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenu(false)}>
                {n.label}
              </a>
            ))}
            <Link to="/entrar" className="lp-enter">
              Entrar
            </Link>
            <a href={copy.destinations.primary} className="lp-btn" onClick={() => setMenu(false)}>
              {copy.hero.primary}
            </a>
          </nav>
        </div>
      </header>

      <main id="topo">
        {/* Hero */}
        <section className="lp-container lp-hero">
          <div className="lp-hero-copy">
            <h1>
              <HeroTitle text={copy.hero.title} />
            </h1>
            <p className="lp-hero-lead">{copy.hero.body}</p>
            <div className="lp-actions">
              <a href={copy.destinations.primary} className="lp-btn">
                {copy.hero.primary}
              </a>
              <a href={copy.destinations.secondary} className="lp-btn secondary">
                {copy.hero.secondary}
              </a>
            </div>
            <p className="lp-status">{copy.status}.</p>
          </div>
          <div className="lp-hero-visual">
            <Photo
              className="lp-photo lp-photo-hero"
              name="hero-rancher"
              alt="Pecuarista consultando o celular junto ao rebanho"
              widths={[480, 768, 1200, 1536]}
              sizes="(min-width: 768px) 55vw, 100vw"
              eager
            />
            <div
              className="lp-preview lp-hero-card"
              aria-label="Exemplo de painel (tela ilustrativa)"
            >
              <div className="lp-preview-head">
                <MiniLogo />
                <Illustrative />
              </div>
              <div className="lp-metrics">
                {[
                  ["1.248", "Animais"],
                  ["42", "Lotes"],
                  ["28", "Manejos pendentes"],
                  ["12", "Tarefas de hoje"],
                ].map(([n, l]) => (
                  <div key={l}>
                    <strong>{n}</strong>
                    <span>{l}</span>
                  </div>
                ))}
              </div>
              <div className="lp-preview-sub">
                <strong>Próximas tarefas</strong>
                <span>Ver todas</span>
              </div>
              <TaskList />
            </div>
          </div>
        </section>

        {/* Benefícios */}
        <section className="lp-band sage lp-band-benefits">
          <div className="lp-container">
            <h2 className="center">{copy.benefits.title}</h2>
            <ul className="lp-three lp-benefits">
              {copy.benefits.items.map((b, i) => {
                const Ic = BENEFIT_ICONS[i]!;
                return (
                  <li key={b.title}>
                    <Ic size={44} strokeWidth={1.8} aria-hidden="true" />
                    <div>
                      <h3>{b.title}</h3>
                      <p>{b.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Três etapas */}
        <section className="lp-band green lp-band-steps" id="como-funciona">
          <div className="lp-container">
            <h2 className="center">{copy.steps.title}</h2>
            <ol className="lp-three lp-steps">
              {copy.steps.items.map((s, i) => (
                <li key={s.title}>
                  <span className="n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                  <ChevronRight className="go" size={22} aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Recursos */}
        <section className="lp-container lp-section lp-resources-wrap" id="recursos">
          <div className="lp-resources-left">
            <h2>
              <TwoLines text={copy.resources.title} />
            </h2>
            <article
              className="lp-preview lp-passport"
              aria-label="Exemplo de ficha do animal (tela ilustrativa)"
            >
              <div className="lp-preview-head">
                <MiniLogo />
                <span className="lp-preview-title">Ficha do animal</span>
                <X size={18} aria-hidden="true" />
              </div>
              <div className="lp-passport-body">
                <Photo
                  className="lp-photo lp-photo-passport"
                  name="animal-history"
                  alt="Animal Nelore com brinco de identificação"
                  widths={[480, 768]}
                  sizes="(min-width: 768px) 220px, 90vw"
                />
                <div className="lp-passport-info">
                  <strong className="lp-animal-name">BRN 3487</strong>
                  <span className="lp-muted">Nelore • Macho • 24 meses</span>
                  <div className="lp-tabs" aria-hidden="true">
                    <span className="on">Histórico</span>
                    <span>Peso</span>
                    <span>Sanidade</span>
                    <span>Reprodução</span>
                  </div>
                  <ol className="lp-timeline">
                    {PASSPORT_EVENTS.map((e) => (
                      <li key={e.title}>
                        <div>
                          <strong>{e.title}</strong>
                          <span>{e.body}</span>
                        </div>
                        <time>{e.date}</time>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <Illustrative />
            </article>
          </div>
          <ul className="lp-resources">
            {copy.resources.items.map((r, i) => {
              const Ic = RESOURCE_ICONS[i]!;
              return (
                <li key={r.title}>
                  <span className="ic">
                    {Ic === "cow" ? (
                      <BrandCow size={26} />
                    ) : (
                      <Ic size={24} strokeWidth={1.8} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>{r.title}</strong>
                    <span>{r.body}</span>
                  </div>
                  <ChevronRight className="go" size={20} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </section>

        {/* Histórico */}
        <section className="lp-container lp-section lp-history-wrap">
          <Photo
            className="lp-photo lp-photo-history"
            name="animal-history"
            alt="Animal Nelore com brinco de identificação no pasto"
            widths={[480, 768, 1200, 1536]}
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <div className="lp-history-copy">
            <h2>{copy.history.title}</h2>
            <ol className="lp-history" aria-label="Exemplo de linha do tempo (tela ilustrativa)">
              {copy.history.items.map((h) => (
                <li key={h.title}>
                  <Photo
                    className="lp-thumb"
                    name="animal-history"
                    alt=""
                    widths={[480]}
                    sizes="96px"
                  />
                  <div>
                    <strong>{h.title}</strong>
                    <span>{h.body}</span>
                  </div>
                </li>
              ))}
            </ol>
            <Illustrative />
          </div>
        </section>

        {/* Assistente */}
        <section className="lp-band sage lp-band-assistant" id="inteligencia">
          <div className="lp-container lp-assistant">
            <div className="lp-assistant-copy">
              <h2>{copy.assistant.title}</h2>
              <p className="lp-lead">{copy.assistant.body}</p>
            </div>
            <div className="lp-chat" aria-label="Exemplo de conversa (tela ilustrativa)">
              <p className="bubble q">
                <img src="/brand/rebania-symbol.png" alt="" />
                <span>{copy.assistant.question}</span>
              </p>
              <p className="bubble a">
                <span>{copy.assistant.response}</span>
              </p>
              <p className="bubble q">
                <img src="/brand/rebania-symbol.png" alt="" />
                <span>{copy.assistant.control}</span>
              </p>
              <Illustrative />
            </div>
            <Photo
              className="lp-photo lp-photo-assistant"
              name="hero-rancher"
              alt=""
              widths={[480, 768]}
              sizes="(min-width: 768px) 260px, 45vw"
            />
          </div>
        </section>

        {/* Plataformas */}
        <section className="lp-container lp-section lp-platforms">
          <h2>{copy.platforms.title}</h2>
          <p className="lp-subtitle">{copy.platforms.subtitle}</p>
          <div className="lp-devices" aria-label="Exemplos de telas (ilustrativas)">
            {[<WebDevice key="w" />, <PhoneOverview key="a" />, <PhoneHerd key="p" />].map(
              (dev, i) => {
                const ch = copy.platforms.channels[i]!;
                return (
                  <figure className={`lp-device ${i === 0 ? "web" : "phone"}`} key={ch.title}>
                    <div className="lp-device-art">{dev}</div>
                    <figcaption>
                      <strong>{ch.title}</strong>
                      <span>{ch.body}</span>
                      {i === 2 && (
                        <span className="lp-offline lp-offline-inline">
                          <WifiOff size={22} aria-hidden="true" />
                          {copy.platforms.body}
                        </span>
                      )}
                      {i === 2 && (
                        <small className="lp-offline-inline">{copy.platforms.note}</small>
                      )}
                    </figcaption>
                  </figure>
                );
              },
            )}
            <div className="lp-devices-note">
              <p>{copy.platforms.body}</p>
              <p className="lp-muted">{copy.platforms.note}</p>
              <Illustrative />
            </div>
          </div>
        </section>

        {/* Contratação */}
        <section className="lp-container lp-section lp-contract-wrap" id="contratacao">
          <h2>{copy.contract.title}</h2>
          <ul className="lp-three lp-contract">
            {copy.contract.items.map((c, i) => {
              const Ic = CONTRACT_ICONS[i]!;
              return (
                <li key={c.title}>
                  <Ic size={40} strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="center lp-muted lp-contract-note">{copy.contract.note}</p>
        </section>

        {/* FAQ */}
        <section className="lp-container lp-section lp-faq-wrap">
          <div className="lp-faq">
            <div className="lp-faq-col first">
              <h2>{copy.faq.title}</h2>
              <details open={!mobile}>
                <summary>
                  <ChevronRight size={18} aria-hidden="true" />
                  {faqFirst!.question}
                </summary>
                <p>{faqFirst!.answer}</p>
              </details>
            </div>
            <div className="lp-faq-col">
              {faqRest.map((f) => (
                <details key={f.question}>
                  <summary>
                    <ChevronRight size={18} aria-hidden="true" />
                    {f.question}
                  </summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <Photo
            className="lp-cta-bg"
            name="pasture-cta"
            alt=""
            widths={[768, 1200, 1536, 2172]}
            sizes="100vw"
          />
          <div className="lp-container lp-cta-inner">
            <h2>
              <TwoLines text={copy.closing.title} />
            </h2>
            <a href={copy.destinations.primary} className="lp-btn light">
              {copy.closing.button}
            </a>
          </div>
        </section>

        {/* Demonstração */}
        <section className="lp-container lp-form-wrap" id="demonstracao">
          <h2>{copy.form.title}</h2>
          <p className="lp-subtitle">{copy.form.subtitle}</p>
          <form onSubmit={(e) => e.preventDefault()} aria-describedby="lp-form-note">
            <fieldset disabled className="lp-form">
              <legend className="visually-hidden">Solicitar contato</legend>
              {copy.form.labels.map((label, i) => {
                const Ic = formIcons[i]!;
                return (
                  <label key={label}>
                    <span className="lp-label">{label}</span>
                    <span className="lp-field">
                      <Ic className="lp-field-ic" size={20} aria-hidden="true" />
                      {i < 2 ? (
                        <input
                          name={i === 0 ? "name" : "email"}
                          type={i === 0 ? "text" : "email"}
                          autoComplete={i === 0 ? "name" : "email"}
                          placeholder={copy.form.placeholders[i]}
                        />
                      ) : (
                        <select name="profile" defaultValue="">
                          <option value="" disabled>
                            {mobile ? copy.form.placeholders[2] : "Selecione…"}
                          </option>
                          {copy.form.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      )}
                    </span>
                  </label>
                );
              })}
              <button type="submit" className="lp-btn">
                {copy.form.button}
              </button>
            </fieldset>
            <p id="lp-form-note" className="lp-muted small lp-form-note">
              {copy.form.previewNote} Os campos ainda não enviam dados.
            </p>
          </form>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <img
            src="/brand/rebania-logo.png"
            alt="Rebania — Sua fazenda em dia."
            className="lp-logo"
            width={170}
            height={57}
          />
          <nav aria-label="Rodapé">
            <a href="#recursos">{copy.footer.links[0]}</a>
            <a href="#contratacao">{copy.footer.links[1]}</a>
            <a href="#demonstracao">{copy.footer.links[2]}</a>
            <Link to="/entrar">{copy.footer.links[3]}</Link>
          </nav>
          <p className="lp-footer-meta">
            <strong>
              {copy.brand} · {copy.status}
            </strong>
            <span>{copy.footer.note}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
