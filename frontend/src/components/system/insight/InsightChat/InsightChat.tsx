import './.css'
import { Link } from 'react-router'
import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'
import { useInsightChat } from './.ts'
import InsightMessage from './components/InsightMessage/InsightMessage'
import InsightComposer from './components/InsightComposer/InsightComposer'
import InsightChatList from './components/InsightChatList/InsightChatList'

const InsightChat = () => {
  const chat = useInsightChat()

  if (!chat.clientSelected) return <>
    <PageHeader title="Insight" />
    <div className="insight-chat flex flex-1 items-center justify-center">
      <h1 className="sr-only">Insight</h1>
      <EmptyState title="No client selected" subtitle="Select one to get started" />
    </div>
  </>

  return <>
    <PageHeader title="Insight">
      <Link to={chat.newChatHref} className="insight-chat__new flex items-center gap-1.5 rounded-lg px-3 py-1.5">
        <span className="material-symbols-outlined text-xl leading-none" aria-hidden="true">add</span>
        New chat
      </Link>
    </PageHeader>
    <div className="flex flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="insight-chat flex flex-1 flex-col items-center">
          <h1 className="sr-only">Insight</h1>
          {chat.loadError && <p className="insight-chat__error w-full rounded-lg px-4 py-3" role="alert">{chat.loadError}</p>}
          {!chat.loading && !chat.loadError && !chat.messages.length &&
            <div className="flex flex-1 items-center justify-center pb-33">
              <EmptyState title="Ask anything" subtitle="Get insight into this household" />
            </div>}
          {!!chat.messages.length &&
            <ol className="insight-chat__thread flex w-full flex-col" aria-label="Conversation" aria-live="polite">
              {chat.messages.map((message) => <InsightMessage key={message.id} message={message} />)}
            </ol>}
          <div ref={chat.setEnd} aria-hidden="true" />
        </div>
        <InsightComposer busy={chat.busy} error={chat.error} onSend={chat.send} />
      </div>
      <InsightChatList chats={chat.chats} newChatHref={chat.newChatHref} newChatSelected={chat.newChatSelected} />
    </div>
  </>
}

export default InsightChat
