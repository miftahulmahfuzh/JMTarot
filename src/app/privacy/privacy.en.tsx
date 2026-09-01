import Link from 'next/link';
import { Callout, Clause, LegalDoc, List, P, SubClause } from '@/components/Legal';
import { OPERATOR } from '../terms/operator';
import { PROVIDER, RETENTION } from './facts';

/**
 * Privacy policy, English. **THIS VERSION DOES NOT GOVERN** (W7-D20).
 *
 * Natively written, not translated. Section ids must match `privacy.id.tsx`
 * exactly -- the terms link to `/privacy#8` and section 8 must be section 8 in
 * both.
 *
 * The same three constraints on the z.ai clause apply here, and they are the
 * most likely thing in this file to be "improved" into something false. See
 * `privacy.id.tsx`'s header and reconciliation §7.1.
 */
export function PrivacyEn({ effective }: { effective: string }) {
  return (
    <LegalDoc title="Privacy Policy" effective={effective}>
      <Clause id="1" n="1." title="Who we are, and how to reach us">
        <P>
          JMTarot is operated by {OPERATOR.legalName}, Indonesia. For anything about your personal
          data, write to <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
        </P>
      </Clause>

      <Clause id="2" n="2." title="What we collect">
        <SubClause id="2-1" n="2.1" title="What Google gives us when you sign in">
          <P>Four things and a flag, and nothing else:</P>
          <List
            items={[
              'The stable identifier Google issues for your account. This is your real identity in our system.',
              'Your email address.',
              'Whether Google says that address is verified.',
              'Your display name and the link to your profile picture.',
            ]}
          />
          <P>
            Not your password. Not your contacts, your calendar, or anything else &mdash; we request
            no other permission.
          </P>
        </SubClause>

        <SubClause id="2-2" n="2.2" title="What we ask you once, at the start">
          <P>
            Your full name, a nickname, your date of birth, and six personal questions. One of them
            reads: <em>&ldquo;The heaviest thing you have watched happen.&rdquo;</em>{' '}We quote it
            here word for word, because a policy that calls that &ldquo;certain personal
            reflections&rdquo; is worse than no policy at all.
          </P>
          <P>Five things about that answer:</P>
          {/*
            v0.7.0 / C-D8, and A1's R31 is the governing precedent: **the third bullet
            was FALSE the day the group chat shipped**, so it is AMENDED IN PLACE rather
            than contradicted by a new clause somewhere below. R31, in its own words:
            *"Amending only 3 and 8 would leave a policy that is technically amended
            and still misleading, which is worse than one plainly out of date."*

            The fifth bullet is new, and it is C-D8 condition 5 written down: a skipped
            answer stays skipped, because **a reader who asks about the thing you
            refused to answer is the worst possible version of this feature.**
          */}
          <List
            items={[
              <>
                <strong>You can skip it</strong>, and the app works completely without it.
              </>,
              <>
                <strong>It is encrypted at rest</strong>{' '}with AES-256-GCM, using a key that is not
                in the source code and not in the database.
              </>,
              <>
                <strong>Of these answers, only an abstract summary ever reaches the language
                model in a reading.</strong>{' '}The distillation is instructed to abstract rather
                than restate: what reaches a reading looks like &ldquo;carries a heavy memory of
                loss&rdquo;, never the incident. Any name you mention never travels with it.{' '}
                <strong>This is about these six answers only.</strong>{' '}If you use the group
                chat, other material reaches your readings as well, and that material is not
                abstract: see <Link href="#2-8">clause 2.8</Link>.
              </>,
              <>
                <strong>In the group chat, your answer is sent word for word.</strong>{' '}This is
                different from a reading, and we say so plainly because it is the entire point of
                that room: so the three readers can respond to your actual life rather than to a
                summary of it. If you would rather they did not, do not open the chat &mdash; or
                clear the answer, which takes effect immediately for both. See{' '}
                <Link href="#2-7">clause 2.7</Link>.
              </>,
              <>
                <strong>What you skipped stays skipped.</strong>{' '}A question you did not answer is
                never sent anywhere, and no reader will ask you about it.
              </>,
              <>
                <strong>You can clear it at any time</strong>, one answer at a time, without
                deleting your account.
              </>,
            ]}
          />
          <P>
            Why we ask at all, when we refuse to read cards on the same subject, is{' '}
            <Link href="/terms#7">terms clause 7</Link>.
          </P>
        </SubClause>

        <SubClause id="2-3" n="2.3" title="Readings">
          <Callout>
            <P>
              <strong>Every reading is stored and kept.</strong>{' '}This reverses how an earlier
              version of this app behaved &mdash; it stored no readings at all &mdash; so if you
              used that version, this is a change.
            </P>
          </Callout>
          <P>
            What is stored: the reader you chose, the kind of reading, the cards that came up and
            whether each was upright or reversed, the question you typed, the text of the reading,
            which model wrote it, and your device&rsquo;s calendar date.
          </P>
          <P>
            The reason is one thing, plainly:{' '}
            <strong>this is what makes the app remember you</strong>{' '}&mdash; the verdict about which
            cards keep returning, readings that refer to your last one, and the reader&rsquo;s
            summary of your day.
          </P>
        </SubClause>

        <SubClause id="2-4" n="2.4" title="Analytics">
          <P>
            Which screens you open, which reader and which kind of reading you pick, when, and how
            each reading turned out. We record event categories, not free text: nothing you type
            goes into an analytics record.
          </P>
          <P>
            No third-party analytics, no advertising, no tracking pixels, nothing cross-site.
          </P>
        </SubClause>

        <SubClause id="2-5" n="2.5" title="Moderation">
          <P>
            If a question is refused, we record the question, the category, whether a word list or
            an automatic check refused it, and when &mdash; so we can find and fix wrong refusals.
          </P>
          <P>
            The text is stored encrypted and{' '}
            <strong>deleted after {RETENTION.moderationQuestionDays} days</strong>; the category and
            the timestamp are kept. For the child-sexual-content category the text is{' '}
            <strong>never recorded at all</strong>.
          </P>
        </SubClause>

        <SubClause id="2-6" n="2.6" title="Technical data">
          <P>
            The session cookie (httpOnly, holding your account identifier and an expiry), the
            language cookie, and the request logs our host keeps &mdash; IP address, browser, and
            the path you asked for.
          </P>
          {/*
            2026-08-09. THE THIRD COOKIE, NAMED BECAUSE 2.6 IS A LIST AND A LIST THAT
            IS SHORT BY ONE IS THE KIND OF THING THIS DOCUMENT CANNOT AFFORD. It is
            `jmt_pwa` -- 256 random bits, httpOnly, set only on a home-screen launch --
            and it exists because iOS gives an installed web app its own cookie jar, so a
            sign-in completed in the browser could otherwise never reach the app. It
            identifies a JAR and not a person: `src/lib/auth/handoff.ts` has the whole
            mechanism.
          */}
          <P>
            If you add JMTarot to your home screen there is one more: a random marker
            (httpOnly) that exists only inside that installed app. It holds nothing about you
            &mdash; it is what lets a sign-in you completed in the browser reach the app,
            which on iOS it otherwise cannot.
          </P>
          <P>We never write the text of your question to a log ourselves.</P>
        </SubClause>

        {/*
          2.7 — v0.7.0's group chat. A NEW SUBCLAUSE rather than a sentence inside 2.3,
          because a room is not a reading and the retention story is different: a chat
          message is stored in PLAINTEXT (C-D20), exactly like `readings.question`, and
          nothing sweeps it.

          **THE SAME ANCHOR SET AS THE INDONESIAN DOCUMENT**, or `legal.test.ts` goes
          red — which is what makes "both locales" mechanical rather than promised.
        */}
        <SubClause id="2-7" n="2.7" title="The group chat">
          <Callout>
            <P>
              <strong>Anything you type in the chat is stored as written, unencrypted</strong>{' '}
              &mdash; exactly like the question you type under the cards. There is no automatic
              deletion, and no button to unsend one message.
            </P>
          </Callout>
          <P>
            What is stored: the text of every message, who wrote it, its language, which message it
            quotes, which reading was attached, and when. The readers&rsquo; own messages are stored
            too, because that is what makes the next stretch of the conversation follow from the
            last.
          </P>
          <P>
            <strong>No human reads this room.</strong>{' '}The operator can see how many messages
            there are and when &mdash; not what they say. See{' '}
            <Link href="#3-1">clause 3.1</Link>.
          </P>
          <P>
            Your messages are not translated. If you write in English, what is stored and what the
            readers read is English.
          </P>
          <P>
            The room goes entirely when you delete your account &mdash; see{' '}
            <Link href="#8">clause 8</Link>.
          </P>
        </SubClause>

        {/*
          2.8 — R2. The SAME ANCHOR SET as the Indonesian document or
          `legal.test.ts` goes red, which is what makes "both locales" mechanical.
          The prose is written rather than translated (S-D6's habit); every claim is
          the same claim, including the uncomfortable one about a note being right.
        */}
        <SubClause id="2-8" n="2.8" title="Notes a machine writes about you">
          <Callout>
            <P>
              <strong>
                The readers keep notes about you, and a language model writes them &mdash; not
                you, and not a person
              </strong>
              . They are made from what you type in the chat, and they outlast the conversation
              itself.
            </P>
          </Callout>
          <P>
            They are short sentences about your habits, what you like and do not like, and what
            is going on in your life &mdash; the things that let &ldquo;how have you been&rdquo;
            carry on from last time instead of starting from nothing. Stored as written,
            unencrypted, exactly like your own messages.
          </P>
          <P>
            <strong>
              The readers also read these notes when they write your card readings, not only when
              you are chatting.
            </strong>{' '}
            At most six of them travel, and the rules we give the readers forbid reading them back
            to you: no listing, no summarising, and never saying how they know. If you have never
            opened the group chat there are no notes, and your readings are exactly what they were
            before.
          </P>
          <P>
            <strong>A note can be wrong.</strong>{' '}A machine is inferring, and an inference is
            sometimes mistaken &mdash; and sometimes uncomfortably accurate. Both are reasons you
            should be able to see them.
          </P>
          <P>
            You can read every one of them and delete them, one at a time or all at once, on the{' '}
            <strong>About You</strong> page. Anything you delete is not read by the readers in the
            next conversation{' '}<strong>or in your next card reading</strong>, and is not written
            back later. There is no way to get it back.
          </P>
          <P>
            No human reads them, and they are not translated. See{' '}
            <Link href="#3-1">clause 3.1</Link>.
          </P>
        </SubClause>
      </Clause>

      <Clause id="3" n="3." title="Why we use each of these">
        <List
          items={[
            'The Google data: so you can sign in, and so we know this account is yours.',
            'The opening answers: so a reading sounds like it is for you rather than for anybody.',
            'Readings: so the app remembers what you have already asked.',
            'The group chat: so the readers answer you, this person, and not a generic one — which is the only reason they see your opening answers as written in there.',
            'The notes about you: so the next conversation carries on from your life instead of starting from nothing each time, and so a card reading is read for the person you actually are.',
            'Analytics: so we know what is broken and what is used.',
            'Moderation: so a wrong refusal can be found and fixed.',
            'Running the Service: so breakage can be fixed, a request about your own data can be answered, and the Terms can be enforced.',
          ]}
        />
        <P>In short: because you asked us to, and because the Service cannot work otherwise.</P>

        {/*
          3.1 — v0.5.0 / A1, decision A-D16. The SAME ANCHOR SET as the Indonesian
          document or `legal.test.ts:266` goes red, which is what makes "both locales"
          mechanical. The prose is rewritten rather than translated (S-D6's habit),
          but every claim is the same claim, including the uncomfortable one about a
          refused question.
        */}
        <SubClause id="3-1" n="3.1" title="Who on our side can see your data">
          <P>
            One person: the operator of this Service. Not a team, and not a door anybody can be
            given &mdash; the list of permitted email addresses lives in the deployment
            environment, and changing it means shipping the app again.
          </P>
          <P>
            What can be seen without opening anything: your profile, which of the opening questions
            you answered (not what you wrote), your readings and their cards, your share links, and
            your moderation records.
          </P>
          <P>
            The sensitive free-text answers and the text of a refused question are different. Both
            are stored encrypted, and both are opened{' '}
            <strong>one at a time, one request per answer</strong>. There is no button that opens
            all six at once, and there is no export.
          </P>
          <P>
            <strong>Every time one answer is opened, one record is written</strong>: who opened it,
            whose it was, which answer, and when. That record never holds the answer itself. And if
            that row cannot be written, the answer is not opened.
          </P>
          {/*
            v0.7.0 / [R15]. Miftah's ruling on Q4: **counts and no text** on
            `/admin/users/[id]`. F7's argument, which the roadmap did not have: A-D16's
            audited one-key-per-request reveal *"was built for a thing you read one
            of"*, and a conversation would be two hundred audit rows for one act of
            reading. Recorded in the policy because a limit nobody wrote down is a
            limit the next release quietly removes.
          */}
          <P>
            <strong>The contents of the chat cannot be opened at all.</strong>{' '}Not one at a time,
            not through the access log &mdash; there is no path. What is visible is how many
            messages exist and when the last one was.
          </P>
          <P>
            What cannot be done: changing your profile, your answers, your readings, or the
            portrait written about you. The operator only reads.
          </P>
          <P>
            If you want to know what has been opened about you, write to{' '}
            <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>. Ask before you
            ask for deletion &mdash; <Link href="#8-1">clause 8.1</Link> says why.
          </P>
        </SubClause>
      </Clause>

      <Clause id="4" n="4." title="Who else sees it">
        {/*
          **THIS LINE USED TO READ "Three parties, and no others."** Reconciliation
          R31: it is an answer about THIRD parties and a reader takes it as the
          exhaustive answer to "who sees my answers". Amending only 3 and 8 would
          leave a policy that is technically amended and still misleading.
        */}
        <P>
          Three parties outside us, and no others. Who inside us can see it is{' '}
          <Link href="#3-1">clause 3.1</Link>.
        </P>

        <SubClause id="4-1" n="4.1" title={`The language model provider (${PROVIDER.name})`}>
          <Callout>
            <P>
              <strong>Your question leaves Indonesia.</strong>{' '}To write each reading and to check
              each question, we send your question, the cards you drew, and the abstract summary of
              your opening answers to {PROVIDER.name}.
            </P>
          </Callout>
          {/*
            v0.7.0 / C-D8. **THE SENTENCE ABOVE BECAME FALSE FOR THE CHAT SURFACE**,
            and A1's R31 says an incomplete amendment is worse than an out-of-date
            policy. It is left exact for readings and answered here for the room,
            rather than softened into something true of neither.
          */}
          <P>
            <strong>From the group chat we send more:</strong>{' '}the message you wrote there, the
            earlier messages in that room, and{' '}
            <strong>your six opening answers word for word</strong>{' '}&mdash; not a summary of them.
            See <Link href="#2-2">clause 2.2</Link> and <Link href="#2-7">2.7</Link>.
          </P>
          {/*
            Card #34. **THE CALLOUT ABOVE BECAME FALSE FOR READINGS TOO** -- the same
            failure C-D8 recorded one paragraph up, and the same repair: leave the callout
            exact and add a paragraph. Softening it into something true of both surfaces
            would leave it true of neither, which is R31's whole point.
          */}
          <P>
            <strong>And if you use the group chat, your readings carry those notes too:</strong>{' '}
            up to six short machine-written sentences about your habits and your character, as
            written rather than summarised. Anything you have deleted is not sent. See{' '}
            <Link href="#2-8">clause 2.8</Link>.
          </P>
          <P>
            <strong>
              This provider&rsquo;s API terms prohibit using what we send to train or improve their
              models unless we explicitly agree.
            </strong>{' '}
            We have not agreed and will not. That protection attaches to the API service we use, not
            to their consumer product. Source:{' '}
            <a href={PROVIDER.termsUrl} target="_blank" rel="noreferrer">
              {PROVIDER.termsLabel}
            </a>
            , checked {PROVIDER.verifiedOn}.
          </P>
          <P>
            Two things we cannot promise on their behalf, because they do not state them:{' '}
            <strong>how long they keep</strong> what is sent through the API, and{' '}
            <strong>which country</strong>{' '}it is processed in. Their general terms do acknowledge
            that content may be processed outside the place you access the service from. We write
            these down as unknown rather than guessing at them.
          </P>
        </SubClause>

        <SubClause id="4-2" n="4.2" title="Google">
          <P>For sign-in only. We send them nothing about your readings.</P>
        </SubClause>

        <SubClause id="4-3" n="4.3" title="Our host">
          <P>Vercel runs the app, so every request passes through them.</P>
        </SubClause>

        {/* 4.4. See the Indonesian file for why it is a sub-clause here rather
            than a new section. */}
        <SubClause id="4-4" n="4.4" title="Anyone you send a link to">
          <P>
            If you create a share link for a reading, that page can be opened by anyone holding the
            address, with no account. What they see: the cards, their orientation, the reading, the
            reader who gave it, the date,{' '}
            <strong>and the question you typed</strong> &mdash; the question is included so the
            reading can be followed. Before the link exists we show you that page as it will be, so
            you know exactly what will be readable. The detail is in{' '}
            <Link href="/terms#18">terms clause 18</Link>.
          </P>
          <P>
            A person who opens that page <strong>is recorded, without being identified</strong>. We
            add one to the link&rsquo;s view count, and we record a <em>share.viewed</em> event with
            no account attached &mdash; no account id, no session id.{' '}
            <strong>We do not set the language cookie every other page sets</strong>, so there is
            nothing on this page that could link one visit to another. What remains is two technical
            cookies from the sign-in library, which apply site-wide: a form-security token and a
            return address. Neither carries an identity and neither holds a session. What we get is
            a number, not a trail.
          </P>
          <P>
            The preview image a messaging app generates contains the cards and the reader&rsquo;s
            name only &mdash; <strong>never your question and never the reading</strong>, even
            though both are on the page. That is deliberate: a preview image is cached by every
            messaging app that sees the link, before anybody opens it. We do not control how long
            that app keeps the image.
          </P>
        </SubClause>


        <P>
          <strong>No advertisers, no data brokers, and no sale of anything, ever.</strong>{' '}We say it
          outright because most people assume the opposite.
        </P>
      </Clause>

      <Clause id="5" n="5." title="Security">
        <P>
          The sensitive opening answers and the text of refused questions are encrypted at rest with
          AES-256-GCM. Everything is served over TLS. The key exists only in the deployment
          environment &mdash; not in the code, not in the database.
        </P>
        <P>
          The limit is worth stating, because a security claim with no limit is not an honest one:
          field encryption protects against a leaked copy of the database, not against a running
          application that has been compromised.
        </P>
        {/*
          R31 again. This is the one paragraph in the document about limits, so it is
          the worst possible place to omit the second one.
        */}
        <P>
          A second limit, and this one is a choice rather than a leak: field encryption does not
          protect you from an operator who is entitled to open it.{' '}
          <Link href="#3-1">Clause 3.1</Link>{' '}sets out what may be opened and what is recorded
          each time it happens.
        </P>
      </Clause>

      <Clause id="6" n="6." title="How long we keep things">
        <List
          items={[
            'Account, profile, opening answers and Lotus avatar: for the life of your account.',
            <>
              <strong>Readings and their cards: for the life of your account</strong>, and
              deliberately not on the clock below &mdash; every memory feature reads them.
            </>,
            'Daily summaries: for the life of your account.',
            /*
              v0.7.0. **NO NUMBER, AND `facts.ts` GAINS NO VARIABLE** — there is no
              retention variable to read, because nothing sweeps this table. A
              hand-typed number here is exactly what `facts.ts` exists to prevent.
            */
            <>
              <strong>The group chat: for the life of your account</strong>, with no automatic
              sweep &mdash; like readings, and for the same reason: every message is material for
              the next stretch of the conversation.
            </>,
            <>
              <strong>The notes about you: for the life of your account</strong>, with no
              automatic sweep. You are what deletes them &mdash; one at a time or all at once,
              on the About You page.
            </>,
            <>
              Analytics records: <strong>{RETENTION.eventsDays} days</strong>, then deleted.
            </>,
            <>
              Moderation records: the question text for{' '}
              <strong>{RETENTION.moderationQuestionDays} days</strong>, the record itself
              indefinitely without the text.
            </>,
            <>
              Share links: for the life of your account.{' '}
              <strong>A link you turned off is kept revoked</strong> rather than deleted, so that
              address can never be issued again for something else.
            </>,
            /*
              R31's third clause. **THE SWEEP IS FORBIDDEN FROM TOUCHING THIS TABLE**
              (roadmap §6), so the honest row reads *kept indefinitely* -- unusual in a
              retention list, which is precisely why it is written rather than inferred.
            */
            <>
              The operator access log: <strong>kept indefinitely</strong>, never deleted. That
              record is what makes &ldquo;what has been opened about me&rdquo; an answerable
              question; deleting it would be the same as never having written it. It never holds
              anything you typed.
            </>,
          ]}
        />
      </Clause>

      <Clause id="7" n="7." title="Your choices">
        <List
          items={[
            'Skip any opening question.',
            'Clear a single answer later, without deleting your account.',
            'Read and delete the notes a machine writes about you, one at a time or all at once, without deleting your account.',
            'Change the app&rsquo;s language whenever you like.',
            <>
              Turn a share link off, from the same reading you made it on.{' '}
              <strong>Turning it off does not un-send a screenshot</strong> somebody already took.
            </>,
            'Delete your account.',
          ]}
        />
      </Clause>

      <Clause id="8" n="8." title="Deleting your account, precisely">
        <P>
          When you ask us to delete it, the account stops working immediately and your data becomes
          unreachable through the app. The text of any refused question is{' '}
          <strong>redacted at that moment</strong>, without waiting for the{' '}
          {RETENTION.moderationQuestionDays}-day schedule, and{' '}
          <strong>the notes a machine wrote about you are erased at that moment too</strong>{' '}
          &mdash; not in {RETENTION.erasureGraceDays}{' '}days, but in the same transaction.
        </P>
        <P>
          <strong>Within {RETENTION.erasureGraceDays} days</strong>{' '}the real deletion runs: your
          profile, opening answers, Lotus avatar, every reading and its cards, your daily
          summaries, <strong>and the whole of the group chat</strong>{' '}are removed from the
          database. During that window you can undo it by signing in again.
        </P>
        {/*
          v0.7.0 / F1-D10, and the honest version of "the cascade covers it". The room
          is on `readings`' side of `delete.ts`'s asymmetry, not `moderation_flags`':
          **`cascade` does not outlive the account, `set null` does** — so the chat is
          NOT cleared at the soft delete, deliberately, because clearing it would break
          the thirty-day restore the sentence above promises. That is precisely why
          `clearFreeTextAnswers()` is absent from the same transaction.
        */}
        <P>
          During that window your chat is still intact in the database, because that is what makes
          undoing it mean anything: if you sign back in, the conversation is still there. The only
          thing redacted immediately is the text of a refused question, because that row does not go
          with the account and therefore cannot wait.
        </P>
        <P>
          What survives: analytics records and moderation records, with no link to your account
          &mdash; the user column is emptied, and a moderation record no longer holds any text. We
          say so because &ldquo;we delete all your data&rdquo; would not be true, and people check.
        </P>

        {/*
          8.1 — A-D16's second required amendment, and the cost is one a person can
          feel: the link to them is the part that gets removed, so afterwards the
          trail cannot answer the one question it exists for. The same bargain
          `events` already pays, and an integration test asserts it rather than
          leaving a policy sentence with nothing behind it.
        */}
        <SubClause id="8-1" n="8.1" title="The operator access log, after deletion">
          <P>
            The operator access log survives deletion too, exactly as the analytics and moderation
            records do: the row stays, and its user columns are emptied.
          </P>
          <P>
            We say so because the consequence is real and unpleasant.{' '}
            <strong>
              After your account is really gone, that log can no longer tell you what was read
              about you
            </strong>
            , because the link to you is the part that was removed. If you want to know, ask before
            you ask for deletion.
          </P>
          <P>
            We do not delete that log and there is no button to delete it. A delete button on an
            audit trail is the audit trail&rsquo;s absence.
          </P>
        </SubClause>
      </Clause>

      <Clause id="9" n="9." title="Children">
        <P>
          The Service is for people 18 and over; see <Link href="/terms#3">terms clause 3</Link>. If
          you believe a child has an account here, tell us at{' '}
          <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>{' '}and we will delete
          it.
        </P>
      </Clause>

      <Clause id="10" n="10." title="Changes to this policy">
        <P>
          This policy is versioned alongside the terms. Material changes are announced in the app
          and ask for your agreement again.
        </P>
      </Clause>

      <Clause id="11" n="11." title="Why we ask about hard things and then refuse to read them">
        <P>
          The full version is <Link href="/terms#7">terms clause 7</Link>. In short: one is a closed
          question you may skip and that we only store; the other is an open request for guidance
          about your safety, which would be answered by a language model with no qualification to
          answer it. We are willing to hold what you tell us. We are not willing to guess.
        </P>
      </Clause>

      <Clause id="12" n="12." title="Language">
        <Callout>
          <P>
            This policy exists in Indonesian and in English.{' '}
            <strong>The Indonesian version governs.</strong>
          </P>
        </Callout>
      </Clause>
    </LegalDoc>
  );
}
