export default function ScreenHeader({ kicker, title, description, action }) {
  return (
    <section className="screen-heading">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  )
}
