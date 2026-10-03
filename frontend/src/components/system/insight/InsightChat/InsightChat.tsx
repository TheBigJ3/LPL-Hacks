import './.css'
import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'
import { useInsightChat } from './.ts'
import InsightMessage from './components/InsightMessage/InsightMessage'
import InsightComposer from './components/InsightComposer/InsightComposer'

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
    <PageHeader title="Insight" />
    <div className="insight-chat flex flex-1 flex-col items-center">
      <h1 className="sr-only">Insight</h1>
      {!chat.messages.length &&
        <div className="flex flex-1 items-center justify-center pb-33">
          <EmptyState title="Ask anything" subtitle="Get insight into this household" />
        </div>}
      {!!chat.messages.length &&
        <ol className="insight-chat__thread flex w-full flex-col" aria-label="Conversation">
          {chat.messages.map((message) => <InsightMessage key={message.id} message={message} />)}
        </ol>}
    </div>
    <InsightComposer onSend={chat.send} />
  </>
}

export default InsightChat
