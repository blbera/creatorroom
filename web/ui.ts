const styles: Record<string, string[]> = {
  shell: ['flex'],

  main: [
    'ml-[50px] w-[calc(100%_-_50px)] max-w-[1800px] px-[18px]',
    'min-[801px]:ml-[76px] min-[801px]:w-[calc(100%_-_76px)]',
    'min-[801px]:px-[25px] xl:px-[42px] 2xl:px-[65px]',
  ],

  header: [
    'flex h-[78px] items-center justify-between border-b border-line',
    'min-[801px]:h-[88px]',
  ],

  rail: [
    'fixed inset-y-0 left-0 flex w-[50px] flex-col items-center bg-[#19352e]',
    'py-[25px] text-[#e5eccc] min-[801px]:w-[76px]',
  ],

  brand: [
    'relative pr-2 font-serif text-[30px] tracking-[-6px] no-underline',
    'min-[801px]:text-[38px] [&_span]:text-accent [&_i]:absolute [&_i]:-right-1',
    '[&_i]:top-1 [&_i]:text-[8px] [&_i]:not-italic',
  ],

  'rail-word': [
    'mt-[70px] text-[8px] tracking-[5px] [writing-mode:vertical-rl]',
    'min-[801px]:text-[10px]',
  ],

  'rail-bottom': ['mt-auto text-[6px] leading-[1.7] tracking-[1px] min-[801px]:text-[8px]'],

  wordmark: [
    'font-display text-[19px] font-extrabold tracking-[-1px]',
    'min-[801px]:text-[23px] [&_span]:mt-[3px] [&_span]:block [&_span]:font-sans',
    '[&_span]:text-[7px] [&_span]:font-normal [&_span]:tracking-[2.4px]',
    'min-[801px]:[&_span]:text-[9px]',
  ],

  'header-actions': [
    'flex items-center gap-[22px] [&_button]:text-[11px]',
    'min-[801px]:[&_button]:text-sm',
  ],

  connection: ['hidden text-xs before:mr-1.5 before:content-["○"] min-[801px]:inline'],

  online: ['before:text-[#4a7154] before:content-["●"]'],

  dark: [
    'inline-flex items-center justify-center rounded-md border-0 bg-pine',
    'px-[18px] py-3 text-[#f4f7e8] no-underline transition-all duration-200',
    'hover:bg-[#315a45] motion-safe:hover:-translate-y-0.5 active:translate-y-0',
  ],

  button: ['whitespace-nowrap text-xs'],

  intro: [
    'flex flex-col items-start justify-between gap-5 pt-[38px] pb-[25px]',
    'min-[801px]:flex-row min-[801px]:items-center min-[801px]:gap-[30px]',
    '[&_h1]:my-3 [&_h1]:max-w-[850px] [&_h1]:font-display [&_h1]:text-[28px]',
    '[&_h1]:leading-[1.2] [&_h1]:font-medium [&_h1]:tracking-[-1.5px]',
    'lg:[&_h1]:text-[42px]',
  ],

  eyebrow: ['text-[9px] font-bold tracking-[2px] text-muted'],

  subtitle: ['text-sm text-muted'],

  'project-select': [
    'grid w-full max-w-full shrink-0 gap-2 text-[10px] tracking-[1.5px]',
    'min-[801px]:w-[clamp(280px,32vw,420px)]',
  ],

  'editorial-select': [
    'h-12 min-h-12 min-w-0 cursor-pointer appearance-none rounded-md border border-line',
    'bg-[#fffef9] py-0 pl-4 pr-12 text-sm leading-normal font-medium tracking-normal',
    'text-ink transition-colors hover:border-[#94a58c]',
  ],

  'workspace-select': ['w-full max-w-full'],

  'version-select': ['w-[160px] max-w-full shrink-0 min-[801px]:w-[180px]'],

  statusbar: [
    'flex flex-wrap items-center gap-2.5 pb-[25px] text-[11px] text-muted',
    'min-[801px]:gap-5',
  ],

  badge: ['rounded-sm bg-[#e8eccc] px-2.5 py-1.5 font-semibold text-[#3e4b32]'],

  'fixture-note': ['mb-5 bg-[#f0eadc] px-[15px] py-2.5 text-xs text-[#6e5d3f]'],

  workspace: [
    'grid grid-cols-[minmax(0,1fr)] gap-[30px]',
    'min-[801px]:grid-cols-[minmax(0,.94fr)_minmax(0,1.06fr)]',
    'min-[801px]:gap-[23px] xl:gap-[38px] 2xl:gap-[55px]',
  ],

  'source-column': ['min-w-0 motion-safe:animate-enter'],

  'pack-column': ['min-w-0 motion-safe:animate-enter'],

  'section-heading': [
    'mb-[18px] flex items-center justify-between gap-2.5 [&_h2]:text-[13px]',
    '[&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_span]:text-[8px]',
    '[&_span]:tracking-[1.3px] [&_span]:text-muted',
  ],

  small: ['mt-[25px] mb-2.5'],

  video: [
    'aspect-video min-h-[200px] w-full overflow-hidden rounded-lg bg-[#233c33]',
    '[&_iframe]:h-full [&_iframe]:min-h-[200px] [&_iframe]:w-full',
  ],

  'video-empty': [
    'flex h-full flex-col justify-center bg-radial-[at_100%_0%] from-[#526547]',
    'to-[#233c33] p-[25px] text-[#e0e7c9] min-[801px]:p-[35px]',
    '[&_span]:text-[8px] [&_span]:tracking-[2px] [&_h2]:my-3.5 [&_h2]:font-serif',
    '[&_h2]:text-3xl [&_h2]:font-normal [&_p]:max-w-[280px] [&_p]:text-[11px]',
    '[&_p]:leading-relaxed',
  ],

  'player-status': [
    'mt-2.5 flex flex-wrap justify-between gap-3 text-[11px] leading-relaxed',
    'min-[801px]:flex-nowrap [&_a]:underline [&_a]:underline-offset-2',
  ],

  micro: ['text-[11px] leading-relaxed text-muted'],

  chapters: [
    'border-t border-line [&_button]:flex [&_button]:w-full',
    '[&_button]:items-center [&_button]:gap-[17px] [&_button]:rounded-none',
    '[&_button]:border-0 [&_button]:border-b [&_button]:border-line',
    '[&_button]:px-1 [&_button]:py-3.5 [&_button]:text-left [&_button]:text-xs',
    '[&_button]:transition-colors [&_time]:text-[10px] [&_time]:text-muted',
    '[&_time]:tabular-nums [&_b]:ml-auto [&_b]:text-sm',
  ],

  transcript: [
    '[&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-line',
    '[&_input]:bg-white [&_input]:p-[13px] [&_input]:text-xs',
  ],

  'transcript-scroll': ['mt-2.5 max-h-[220px] overflow-auto min-[801px]:max-h-[320px]'],

  cue: [
    'flex gap-[15px] border-b border-line py-3.5 [&_button]:self-start',
    '[&_button]:border-0 [&_button]:bg-[#e9eddf] [&_button]:px-[7px]',
    '[&_button]:py-[5px] [&_button]:text-[10px] [&_p]:text-xs [&_p]:leading-[1.8]',
    '[&_p]:text-[#536157]',
  ],

  tabs: [
    'flex flex-wrap gap-[15px] border-b border-line min-[801px]:gap-1.5 xl:gap-3',
    '[&_button]:rounded-none [&_button]:border-0 [&_button]:border-b-2',
    '[&_button]:border-transparent [&_button]:px-1 [&_button]:py-3',
    '[&_button]:text-[11px] [&_button]:whitespace-nowrap [&_button]:text-muted',
    '[&_button]:transition-colors [&_button[aria-selected=true]]:border-pine',
    '[&_button[aria-selected=true]]:font-bold',
    '[&_button[aria-selected=true]]:text-pine',
  ],

  asset: [
    'mt-[15px] overflow-hidden rounded-lg border border-line bg-[#fffef9]',
    'transition-shadow duration-300 hover:shadow-[0_8px_28px_-24px_#203e34]',
  ],

  'asset-top': [
    'flex items-center justify-between border-b border-[#e9ecdf] px-5 py-4',
    '[&_button]:px-2 [&_button]:py-[5px] [&_button]:text-[10px]',
  ],

  'asset-content': [
    'motion-safe:animate-enter max-h-[480px] overflow-auto p-6 text-sm',
    'leading-[1.9] whitespace-pre-wrap wrap-anywhere',
  ],

  evidence: [
    'bg-[#f0f3e8] px-5 py-[17px] [&_summary]:cursor-pointer',
    '[&_summary]:text-[11px] [&_summary]:font-semibold [&_p]:mt-[15px] [&_p]:mb-2',
    '[&_p]:text-xs [&_blockquote]:m-2.5 [&_blockquote]:font-serif',
    '[&_blockquote]:text-sm',
  ],

  'evidence-source': [
    'my-2.5 block max-w-full rounded-none border-0 border-l-2 border-[#a7b899]',
    'px-2.5 py-1 text-left text-[11px] leading-relaxed transition-colors',
    'hover:bg-[#e3ead7]',
  ],

  empty: ['py-2.5 text-xs leading-[1.7] text-muted'],

  'asset-empty': [
    'px-[25px] py-[45px] [&_h3]:mb-3 [&_h3]:font-serif [&_h3]:text-[26px]',
    '[&_h3]:font-normal',
  ],

  review: ['mt-[25px] [&>p]:text-xs'],

  finding: [
    'border-t border-line py-3.5 [&_span]:text-[9px] [&_span]:font-bold',
    '[&_span]:tracking-[.6px] [&_p]:my-[9px] [&_p]:text-xs [&_p]:leading-relaxed',
    '[&_button]:text-[10px]',
  ],

  exports: [
    'mt-[25px] flex flex-col items-start justify-between gap-[15px] border-t',
    'border-line py-[22px] xl:flex-row xl:items-center [&_h3]:mb-[7px]',
    '[&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-[10px] [&_p]:text-muted',
    '[&>div:last-child]:flex [&>div:last-child]:flex-wrap',
    '[&>div:last-child]:gap-[7px] [&_a]:rounded [&_a]:border [&_a]:border-line',
    '[&_a]:p-2 [&_a]:text-[10px] [&_a]:no-underline [&_a]:transition-colors',
    '[&_a:hover]:bg-[#e7eddf]',
  ],

  disabled: ['pointer-events-none opacity-40'],

  diff: [
    'border-t border-line p-5 [&_h4]:mb-3 [&_h4]:text-xs [&_h4]:font-semibold',
    '[&_del]:block [&_del]:bg-[#f9e4dd] [&_del]:p-3 [&_del]:text-xs',
    '[&_del]:leading-relaxed [&_del]:whitespace-pre-wrap [&_del]:wrap-anywhere',
    '[&_ins]:mt-2.5 [&_ins]:block [&_ins]:bg-[#e5efd9] [&_ins]:p-3',
    '[&_ins]:text-xs [&_ins]:leading-relaxed [&_ins]:no-underline',
    '[&_ins]:whitespace-pre-wrap [&_ins]:wrap-anywhere [&_summary]:my-3',
    '[&_summary]:cursor-pointer [&_summary]:text-xs',
  ],

  slack: [
    'my-[35px] flex flex-wrap items-start gap-[22px] rounded-md border',
    'border-[#d6dfcd] bg-[#e8eddf] p-5 min-[801px]:flex-nowrap',
    'min-[801px]:items-center min-[801px]:p-[26px] [&_h3]:mb-2 [&_h3]:text-lg',
    '[&_h3]:font-semibold [&_p]:mb-3 [&_p]:text-xs [&_p]:leading-relaxed',
    '[&_p]:text-muted [&_code]:my-[3px] [&_code]:mr-1.5 [&_code]:inline-block',
    '[&_code]:rounded-sm [&_code]:bg-[#dce5d2] [&_code]:px-[7px]',
    '[&_code]:py-[5px] [&_code]:text-[10px] [&>a]:text-xs',
    'min-[801px]:[&>a]:ml-auto [&>span]:text-xs',
  ],

  'slack-mark': ['hidden text-[50px] text-[#56714c] min-[801px]:block'],

  footer: [
    'flex justify-between gap-5 border-t border-line pt-5 pb-7 text-[9px]',
    'tracking-[1px] text-muted [&_span]:tracking-normal',
  ],

  alert: ['mt-5 rounded-md bg-[#f6ded4] p-[15px] text-[13px] motion-safe:animate-enter'],

  'modal-backdrop': [
    'fixed inset-0 z-10 flex items-center justify-center bg-[#15291fcc] p-[25px]',
    'motion-safe:animate-fade',
  ],

  modal: [
    'relative max-h-[90vh] w-[550px] overflow-auto rounded-xl bg-[#fafbf5]',
    'p-[30px] shadow-2xl motion-safe:animate-dialog [&_h2]:mb-4 [&_h2]:font-serif',
    '[&_h2]:text-3xl [&_p]:text-xs [&_p]:text-muted [&_label]:my-4 [&_label]:grid',
    '[&_label]:gap-1.5 [&_label]:text-xs [&_input]:rounded [&_input]:border',
    '[&_input]:border-line [&_input]:bg-white [&_input]:p-2.5',
    '[&_textarea]:min-h-[90px] [&_textarea]:rounded [&_textarea]:border',
    '[&_textarea]:border-line [&_textarea]:bg-white [&_textarea]:p-2.5',
  ],

  close: ['absolute top-[15px] right-[15px] border-0 text-xl'],
};

export const cx = (...groups: string[]) =>
  groups
    .flatMap((group) => group.split(/\s+/).filter(Boolean))
    .map((name) => `${name} ${styles[name]?.join(' ') ?? ''}`)
    .join(' ');
