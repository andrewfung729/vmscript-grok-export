import { describe, expect, it } from 'vitest';
import {
  buildFilename,
  renderDocument,
  slugify,
  today,
} from '../src/grok-export/render';
import {
  extract,
  readConversationId,
  readTitle,
} from '../src/grok-export/dom/extract';
import { WORD_JOINER } from '../src/grok-export/dom/selectors';
import { syntheticDoc } from './fixtures';

/**
 * The output contract from README.md: frontmatter keys and order, the callout that delimits each
 * turn, the per-turn Sources list, and the filename rule. `render.ts` is the only place that
 * assembles them.
 */

const META = {
  title: 'Capital gains tax and revenue',
  url: 'https://grok.com/c/6d27fe4b-9bfc-4d9f-ad88-3ac7e108e1a9',
  conversationId: '6d27fe4b-9bfc-4d9f-ad88-3ac7e108e1a9',
  exported: '2026-09-29',
};

describe('renderDocument', () => {
  const messages = extract(syntheticDoc());
  const markdown = renderDocument(messages, META);

  it('opens with the frontmatter block, in the documented order', () => {
    const frontmatter = markdown.split('---\n')[1];
    expect(frontmatter.split('\n').filter(Boolean)).toEqual([
      'title: Capital gains tax and revenue',
      'source: grok.com',
      `url: ${META.url}`,
      `conversationId: ${META.conversationId}`,
      'exported: 2026-09-29',
      `messageCount: ${messages.length}`,
    ]);
  });

  it('counts the messages it was given', () => {
    expect(messages).toHaveLength(4);
    expect(markdown).toContain('messageCount: 4');
  });

  it('delimits each turn with a callout named for its role', () => {
    const turns = [...markdown.matchAll(/^> \[!(\w+)\] (.+)$/gm)].map(
      (match) => [match[1], match[2]],
    );
    expect(turns).toEqual([
      ['user', 'User'],
      ['grok', 'Grok'],
      ['user', 'User'],
      ['grok', 'Grok'],
    ]);

    // An `<h2>` inside an answer is body content, not a turn boundary, and survives as `##`.
    expect(markdown).toContain('\n> ## Three effects\n');
  });

  it('never leaves an unprefixed blank line inside a turn', () => {
    // A blank line inside a callout ends it in Obsidian, and every line of the turn — fences, table
    // rows, the Sources list — has to carry the `>`. The only unprefixed blank lines may be the ones
    // that separate two turns.
    const body = markdown.slice(markdown.indexOf('> [!user]'));
    expect(body).not.toMatch(/\n\n(?!> \[!)/);
    expect(body).toMatch(/\n>\n/);
  });

  it('keeps the citation tags out of the prose', () => {
    const [prose, sources] = markdown.split('> **Sources**');
    expect(sources).toBeTruthy();

    // Every URL lives in the Sources list, and none of them in the prose before it.
    expect(prose).not.toContain('cbo.gov');
    expect(prose).not.toContain('nber.org');
    expect(prose).not.toContain(WORD_JOINER);
    // The sentences the tags were attached to survive intact.
    expect(prose).toContain(
      '> The elasticity of realisations is what decides the sign.\n',
    );
    expect(prose).toContain('> And the earlier note still applies.\n');
  });

  it('appends a Sources list to a turn that cites something, deduplicated in order', () => {
    // Message 2 cites CBO twice and NBER once, so the list holds two entries and the duplicate is
    // collapsed.
    expect(markdown).toContain(
      '> **Sources**\n>\n> - [CBO](https://www.cbo.gov/publication/example)\n> - [NBER](https://www.nber.org/paper/example)',
    );
    expect(
      markdown.match(
        /\[CBO\]\(https:\/\/www\.cbo\.gov\/publication\/example\)/g,
      ),
    ).toHaveLength(1);
    expect(
      markdown.match(/\[NBER\]\(https:\/\/www\.nber\.org\/paper\/example\)/g),
    ).toHaveLength(1);
  });

  it('gives a turn with no citations no Sources list', () => {
    const turns = markdown
      .slice(markdown.indexOf('> [!'))
      .split(/\n\n(?=> \[!)/);
    expect(turns).toHaveLength(messages.length);
    expect(turns.filter((turn) => turn.includes('**Sources**'))).toHaveLength(
      1,
    );
    expect(turns[1]).toContain('**Sources**');
    // The fourth message is a Grok answer that cites nothing.
    expect(turns[3]).not.toContain('**Sources**');
  });

  it('quotes a title that would otherwise break the YAML', () => {
    const quoted = renderDocument(messages, {
      ...META,
      title: 'Q3: what "growth" means',
    });
    expect(quoted).toContain('title: "Q3: what \\"growth\\" means"');
  });

  it('carries no thinking label into the file', () => {
    expect(markdown).not.toContain('Worked for');
  });
});

describe('buildFilename', () => {
  it('slugifies the title', () => {
    expect(
      buildFilename('Capital gains tax and revenue', META.conversationId),
    ).toBe('capital-gains-tax-and-revenue.md');
  });

  it('falls back to the conversation id when the title slugs to nothing', () => {
    expect(buildFilename('中文標題', META.conversationId)).toBe('中文標題.md');
    expect(buildFilename('!!! ???', META.conversationId)).toBe(
      `${META.conversationId}.md`,
    );
    expect(slugify('!!! ???')).toBe('');
  });

  it('falls back to a constant when there is no id either', () => {
    expect(buildFilename('', null)).toBe('conversation.md');
  });
});

describe('document readers', () => {
  it('strips the grok.com title suffix', () => {
    expect(readTitle('Excess Returns: Company Pursuit - Grok')).toBe(
      'Excess Returns: Company Pursuit',
    );
    expect(readTitle('Just a title')).toBe('Just a title');
  });

  it('reads the conversation id from the path, not from ?rid=', () => {
    expect(readConversationId('/c/cabb7763-a995-439f-b898-426e2e94efdc')).toBe(
      'cabb7763-a995-439f-b898-426e2e94efdc',
    );
    expect(
      readConversationId(
        '/c/cabb7763-a995-439f-b898-426e2e94efdc?rid=8507bc9b-b233-4fbf-8a7a-9ba7870adeed',
      ),
    ).toBe('cabb7763-a995-439f-b898-426e2e94efdc');
    expect(readConversationId('/')).toBeNull();
  });

  it('writes today as a sortable local date', () => {
    expect(today(new Date(2026, 8, 29))).toBe('2026-09-29');
  });
});
