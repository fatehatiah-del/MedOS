import { cn } from "@medos/ui";
import {
  type Block,
  type CalloutBlock,
  type FigureBlock,
  type FlowBlock,
  HEADING_UNIT,
  type Inline,
  type ListBlock,
  type MediaRef,
  type StudyGuideSection,
  type TableBlock,
  type TextMark,
  blockPath,
  captionPath,
  cellPath,
  figureNotesPath,
  flowStepPath,
  listItemPath,
  plainText,
} from "@medos/parsers/model";
import { ArrowRight, ImageOff } from "lucide-react";
import { type ElementType, Fragment, type ReactNode } from "react";

import { CALLOUT_STYLES, PLAIN_CALLOUT } from "./callouts";
import { FigureImage } from "./figure-image";
import { unitKey } from "./reader-model";
import { type MarkRange, type Piece, type TextPiece, segmentInlines, slideLabel } from "./segments";
import {
  type ListNode,
  cellIsEmpty,
  headingLabel,
  layoutTable,
  nestListItems,
  tableColumnCount,
} from "./structure";

/*
 * The Study Guide, rendered from its parsed structure.
 *
 * Every block keeps its source structure as real HTML (headings, lists,
 * tables, figures). Text is rendered exactly as parsed, never inserted as
 * HTML. Each passage of readable text (a text unit) carries `data-unit`, its
 * path within the section, so selections and stored annotations can point at
 * it; elements that are not source text are kept outside those elements.
 */

export interface RenderContext {
  resourceId: string;
  /** Null while rendering the preamble. */
  sectionId: string | null;
  /** The heading of the section being rendered, for labelling regions. */
  sectionLabel: string;
  /** The user's marks, by `unitKey`. */
  marks: ReadonlyMap<string, readonly MarkRange[]>;
}

const MARK_TAGS: Record<TextMark, ElementType> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  superscript: "sup",
  subscript: "sub",
};

/** The browser address of an image extracted from a resource. Private: checked on every request. */
export function mediaSrc(resourceId: string, media: MediaRef): string {
  return `/api/resources/${resourceId}/media/${media.hash}`;
}

function withMarks(text: string, marks: readonly TextMark[]): ReactNode {
  return marks.reduceRight<ReactNode>((child, mark) => {
    const Tag = MARK_TAGS[mark];
    return <Tag>{child}</Tag>;
  }, text);
}

function annotated(content: ReactNode, piece: { annotations: readonly MarkRange[] }, key: number) {
  if (piece.annotations.length === 0) return <Fragment key={key}>{content}</Fragment>;
  const kinds = [...new Set(piece.annotations.map((range) => range.kind))].join(" ");
  return (
    <mark
      key={key}
      className="sg-mark"
      data-kinds={kinds}
      data-annotation-ids={piece.annotations.map((range) => range.id).join(" ")}
    >
      {content}
    </mark>
  );
}

function renderText(piece: TextPiece, key: number) {
  return annotated(withMarks(piece.text, piece.marks), piece, key);
}

function renderPiece(piece: Piece, key: number): ReactNode {
  switch (piece.type) {
    case "text":
      return renderText(piece, key);
    case "break":
      return <br key={key} />;
    case "slide-ref":
      return (
        <span key={key} className="sg-slide-ref" title={`Lecture ${slideLabel(piece.slides)}`}>
          {piece.pieces.map(renderText)}
        </span>
      );
  }
}

/** Inline content with the user's marks over it. The text is exactly the source's. */
export function InlineContent({
  inlines,
  ranges = [],
}: {
  inlines: readonly Inline[];
  ranges?: readonly MarkRange[];
}) {
  return <>{segmentInlines(inlines, ranges).map(renderPiece)}</>;
}

/** An element holding one text unit. */
function Unit({
  as: Tag = "span",
  path,
  inlines,
  context,
  className,
  ...rest
}: {
  as?: ElementType;
  path: string;
  inlines: readonly Inline[];
  context: RenderContext;
  className?: string;
  id?: string;
  tabIndex?: number;
}) {
  return (
    <Tag data-unit={path} className={className} {...rest}>
      <InlineContent
        inlines={inlines}
        ranges={context.marks.get(unitKey(context.sectionId, path))}
      />
    </Tag>
  );
}

function ListNodes({
  nodes,
  list,
  path,
  context,
}: {
  nodes: readonly ListNode[];
  list: ListBlock;
  path: string;
  context: RenderContext;
}) {
  const labelled = list.ordered && nodes.some((node) => node.item.label);
  const items = nodes.map((node) => (
    <li key={node.index} className={labelled ? "flex gap-2" : undefined}>
      {labelled ? (
        <span className="shrink-0 font-medium text-fg-muted tabular-nums">{node.item.label}</span>
      ) : null}
      <div className="min-w-0">
        <Unit path={listItemPath(path, node.index)} inlines={node.item.inlines} context={context} />
        {node.children.length > 0 ? (
          <ListNodes nodes={node.children} list={list} path={path} context={context} />
        ) : null}
      </div>
    </li>
  ));
  if (labelled) {
    // The source's own numbers are shown as text, so nothing is renumbered.
    return (
      <ol role="list" className="sg-list list-none space-y-1.5">
        {items}
      </ol>
    );
  }
  return list.ordered ? (
    <ol className="sg-list list-decimal space-y-1.5 pl-5">{items}</ol>
  ) : (
    <ul className="sg-list list-disc space-y-1.5 pl-5 marker:text-fg-subtle">{items}</ul>
  );
}

function TableView({
  table,
  path,
  context,
}: {
  table: TableBlock;
  path: string;
  context: RenderContext;
}) {
  const rows = layoutTable(table);
  const columns = tableColumnCount(table);
  const headRows = rows.filter(
    (row, index) => row.header && rows.slice(0, index).every((r) => r.header),
  );
  const bodyRows = rows.slice(headRows.length);

  const renderRow = (row: (typeof rows)[number], inHead: boolean) => (
    <tr key={row.index}>
      {row.cells.map((laidOut) => {
        const header = (inHead || row.header) && !cellIsEmpty(laidOut.cell);
        const Cell = header ? "th" : "td";
        return (
          <Cell
            key={laidOut.index}
            scope={header ? (laidOut.colSpan > 1 ? "colgroup" : "col") : undefined}
            colSpan={laidOut.colSpan > 1 ? laidOut.colSpan : undefined}
            rowSpan={laidOut.rowSpan > 1 ? laidOut.rowSpan : undefined}
          >
            <Blocks
              blocks={laidOut.cell.blocks}
              parent={cellPath(path, row.index, laidOut.index)}
              context={context}
              compact
            />
          </Cell>
        );
      })}
    </tr>
  );

  return (
    // Wide tables scroll inside this region, never the page. It is focusable so
    // keyboard users can scroll it too.
    <div
      role="region"
      aria-label={`Table in ${context.sectionLabel}`}
      tabIndex={0}
      className="sg-table-scroll overflow-x-auto rounded-lg border border-border"
    >
      <table
        className="sg-table w-full border-collapse text-left"
        style={columns >= 3 ? { minWidth: `${columns * 7}rem` } : undefined}
      >
        {headRows.length > 0 ? <thead>{headRows.map((row) => renderRow(row, true))}</thead> : null}
        <tbody>{bodyRows.map((row) => renderRow(row, false))}</tbody>
      </table>
    </div>
  );
}

function CalloutView({
  callout,
  path,
  context,
}: {
  callout: CalloutBlock;
  path: string;
  context: RenderContext;
}) {
  const style = callout.kind ? CALLOUT_STYLES[callout.kind] : null;
  const tone = style ?? PLAIN_CALLOUT;
  const Icon = style?.icon;
  const labelId = `label-${context.sectionId ?? "preamble"}-${path.replaceAll(".", "-")}`;
  return (
    <div
      role="note"
      aria-labelledby={callout.label ? labelId : undefined}
      data-callout={callout.kind ?? "plain"}
      className={cn("rounded-xl border px-4 py-3.5 sm:px-5", tone.box)}
    >
      {callout.label ? (
        <p
          id={labelId}
          className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold tracking-wide text-fg"
        >
          {Icon ? <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone.accent)} /> : null}
          <span>{callout.label}</span>
        </p>
      ) : null}
      <Blocks blocks={callout.blocks} parent={path} context={context} compact />
    </div>
  );
}

function FlowView({
  flow,
  path,
  context,
}: {
  flow: FlowBlock;
  path: string;
  context: RenderContext;
}) {
  return (
    <ol
      role="list"
      aria-label="Sequence"
      className="sg-flow flex list-none flex-col items-stretch gap-1.5 @xl:flex-row @xl:flex-wrap @xl:items-center"
    >
      {flow.steps.map((step, index) => (
        <li key={index} className="flex flex-col items-center gap-1.5 @xl:flex-row">
          {index > 0 ? (
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 rotate-90 text-fg-subtle @xl:rotate-0"
            />
          ) : null}
          <Unit
            path={flowStepPath(path, index)}
            inlines={step}
            context={context}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-[14.5px] @xl:w-auto"
          />
        </li>
      ))}
    </ol>
  );
}

/** The accessible name of an image: the source's own description, else its caption. Never invented. */
function imageAlt(media: MediaRef, caption: readonly Inline[]): string {
  const captionText = plainText(caption.filter((inline) => inline.type !== "slide-ref")).trim();
  return (
    media.altText?.trim() ||
    captionText ||
    "Image from the Study Guide (the source gives no description)"
  );
}

function FigureView({
  figure,
  path,
  context,
}: {
  figure: FigureBlock;
  path: string;
  context: RenderContext;
}) {
  const captionText = plainText(figure.caption).trim();
  return (
    <div className="space-y-3">
      <figure className="space-y-2.5">
        {figure.media.map((media, index) => (
          <FigureImage
            key={`${media.hash}-${index}`}
            src={mediaSrc(context.resourceId, media)}
            alt={imageAlt(media, figure.caption)}
            caption={captionText}
          />
        ))}
        {figure.caption.length > 0 ? (
          <Unit
            as="figcaption"
            path={captionPath(path)}
            inlines={figure.caption}
            context={context}
            className="text-[13.5px] leading-relaxed text-fg-muted"
          />
        ) : null}
      </figure>
      {figure.notes.length > 0 ? (
        <Blocks blocks={figure.notes} parent={figureNotesPath(path)} context={context} />
      ) : null}
    </div>
  );
}

function BlockView({
  block,
  path,
  context,
}: {
  block: Block;
  path: string;
  context: RenderContext;
}) {
  switch (block.type) {
    case "paragraph":
      return block.inlines.length > 0 ? (
        <Unit as="p" path={path} inlines={block.inlines} context={context} />
      ) : null;
    case "list":
      return (
        <ListNodes nodes={nestListItems(block.items)} list={block} path={path} context={context} />
      );
    case "table":
      return <TableView table={block} path={path} context={context} />;
    case "callout":
      return <CalloutView callout={block} path={path} context={context} />;
    case "flow":
      return <FlowView flow={block} path={path} context={context} />;
    case "image":
      return (
        <FigureImage
          src={mediaSrc(context.resourceId, block.media)}
          alt={imageAlt(block.media, [])}
          caption=""
        />
      );
    case "figure":
      return <FigureView figure={block} path={path} context={context} />;
    case "missing-image":
      return (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-fg-muted"
        >
          <ImageOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>An image in the source could not be shown: {block.reason}</span>
        </p>
      );
  }
}

/** Blocks in source order. `parent` is the container's path (null at the top of a section). */
export function Blocks({
  blocks,
  parent,
  context,
  compact = false,
}: {
  blocks: readonly Block[];
  parent: string | null;
  context: RenderContext;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} path={blockPath(parent, index)} context={context} />
      ))}
    </div>
  );
}

const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6"] as const;

/**
 * One section: its heading (at its source level, below the page title) and
 * its blocks. `actions` sit beside the heading, outside its text.
 */
export function SectionView({
  section,
  context,
  actions,
}: {
  section: StudyGuideSection;
  context: Omit<RenderContext, "sectionId" | "sectionLabel">;
  actions?: ReactNode;
}) {
  const Heading = HEADING_TAGS[Math.min(section.level, HEADING_TAGS.length) - 1] ?? "h6";
  const sectionContext: RenderContext = {
    ...context,
    sectionId: section.id,
    sectionLabel: headingLabel(section.heading) || "this section",
  };
  const style = section.semanticKind ? CALLOUT_STYLES[section.semanticKind] : null;
  const Icon = style?.icon;
  return (
    <section
      aria-labelledby={section.id}
      data-sg-section={section.id}
      data-level={section.level}
      data-semantic={section.semanticKind ?? undefined}
      className={cn(
        "sg-section scroll-mt-28",
        section.level === 1 ? "pt-6" : "pt-2",
        style && "rounded-xl border px-4 py-4 sm:px-5",
        style?.box,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {Icon ? (
            <Icon aria-hidden="true" className={cn("mt-1.5 size-5 shrink-0", style?.accent)} />
          ) : null}
          <Unit
            as={Heading}
            id={section.id}
            tabIndex={-1}
            path={HEADING_UNIT}
            inlines={section.heading}
            context={sectionContext}
            className={cn(
              "sg-heading scroll-mt-28 font-serif text-fg focus:outline-none",
              section.level === 1
                ? "text-[1.6rem] leading-tight font-semibold"
                : section.level === 2
                  ? "text-[1.25rem] leading-snug font-semibold"
                  : "text-[1.075rem] leading-snug font-semibold",
            )}
          />
        </div>
        {actions}
      </div>
      <Blocks blocks={section.blocks} parent={null} context={sectionContext} />
      {/* Reaching this point means the end of the section was read. */}
      <span data-sg-end={section.id} aria-hidden="true" className="block h-px" />
    </section>
  );
}
