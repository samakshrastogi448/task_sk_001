import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { story } from './data.js'

gsap.registerPlugin(ScrollTrigger)

function Photo({ src, alt, className = '', loading = 'lazy', fetchPriority = 'auto' }) {
  return (
    <img
      className={`photo ${className}`}
      src={src}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
    />
  )
}

function App() {
  const root = useRef(null)
  const [entered, setEntered] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow

    if (!entered) {
      document.body.style.overflow = 'hidden'
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } else {
      document.body.style.overflow = previousOverflow
    }

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [entered])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!entered) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const ctx = gsap.context(() => {
      gsap.from('.hero-title span', {
        yPercent: 120,
        opacity: 0,
        duration: 1.3,
        ease: 'power4.out',
        stagger: 0.08,
      })

      gsap.utils.toArray('.scene').forEach((section) => {
        const media = section.querySelectorAll('.photo, .frame, .scene-visual')
        const copy = section.querySelectorAll('.scene-copy > *')

        gsap.from(media, {
          y: 46,
          scale: 1.035,
          opacity: 0.12,
          duration: 1.2,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: section, start: 'top 78%' },
        })
        gsap.from(copy, {
          y: 28,
          opacity: 0,
          duration: 0.9,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: { trigger: section, start: 'top 72%' },
        })
      })

      gsap.utils.toArray('[data-parallax]').forEach((el) => {
        gsap.to(el, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: el.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        })
      })
    }, root)

    return () => ctx.revert()
  }, [entered])

  const handleEnter = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    setEntered(true)
  }

  const p = story.photos
  const s = story.scenes

  return (
    <main ref={root} className={entered ? 'site is-entered' : 'site'}>
      <style>{`
        .hero-title { margin: 0; font-weight: 400; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto !important; }
          .entry-rain, .finale-rain, .scroll-note i::after { animation: none !important; }
          .enter-button { transition: none !important; }
        }
      `}</style>

      <div className="progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>

      {!entered && (
        <section className="entry" aria-label="Experience introduction">
          <div className="entry-rain" aria-hidden="true" />
          <div className="entry-card">
            <span className="eyebrow">Project 001 · Wedding Story</span>
            <h1>Monsoon Vows</h1>
            <p>A cinematic wedding story shaped by rain, ritual and light.</p>
            <button onClick={handleEnter} className="enter-button" aria-label="Open the Monsoon Letter">
              <span>Open the Monsoon Letter</span>
              <span aria-hidden="true">↘</span>
            </button>
          </div>
        </section>
      )}

      <div className="story" aria-hidden={!entered}>
        <header className="hero scene">
          <Photo
            src={p[0]}
            alt="Indian wedding couple portrait"
            className="hero-photo"
            loading="eager"
            fetchPriority="high"
          />
          <div className="hero-wash" />
          <div className="hero-meta">
            <span>{story.couple.date}</span>
            <span>{story.couple.location}</span>
          </div>
          <h1 className="hero-title" aria-label={`${story.couple.first} and ${story.couple.second}`}>
            <span>{story.couple.first}</span>
            <span className="amp">&</span>
            <span>{story.couple.second}</span>
          </h1>
          <div className="scroll-note"><span>Scroll the story</span><i /></div>
        </header>

        <section className="scene scene-editorial split-pad">
          <div className="scene-copy narrow">
            <span className="eyebrow">{s[0].kicker}</span>
            <h2>{s[0].title}</h2>
            <p>{s[0].note}</p>
          </div>
          <div className="portrait-stack">
            <div className="frame tall"><Photo src={p[1]} alt="Wedding portrait in traditional attire" /></div>
            <div className="frame small"><Photo src={p[2]} alt="Warm wedding portrait with festive lights" /></div>
          </div>
        </section>

        <section className="scene quote-scene">
          <div className="rain-word" aria-hidden="true">RAIN</div>
          <div className="scene-copy centered">
            <span className="eyebrow">{s[1].kicker}</span>
            <h2>{s[1].title}</h2>
            <p>{s[1].note}</p>
          </div>
        </section>

        <section className="scene fullbleed">
          <Photo src={p[3]} alt="Traditional Indian wedding couple" className="scene-visual" />
          <div className="fullbleed-copy scene-copy">
            <span className="eyebrow">{s[2].kicker}</span>
            <h2>{s[2].title}</h2>
            <p>{s[2].note}</p>
          </div>
        </section>

        <section className="scene filmstrip-scene">
          <div className="scene-copy film-copy">
            <span className="eyebrow">{s[3].kicker}</span>
            <h2>{s[3].title}</h2>
            <p>{s[3].note}</p>
          </div>
          <div className="filmstrip" aria-label="Wedding filmstrip">
            {[p[4], p[5], p[0], p[2]].map((src, i) => <Photo src={src} key={src + i} alt={`Wedding film frame ${i + 1}`} />)}
          </div>
        </section>

        <section className="scene ritual-grid">
          <div className="ritual-title scene-copy">
            <span className="eyebrow">{s[4].kicker}</span>
            <h2>{s[4].title}</h2>
          </div>
          <div className="ritual-collage">
            <Photo src={p[6]} alt="Indian bride getting ready" className="ritual-a" />
            <div className="ritual-note scene-copy"><p>{s[4].note}</p><span>01 / 03</span></div>
            <Photo src={p[4]} alt="Wedding couple portrait" className="ritual-b" />
          </div>
        </section>

        <section className="scene pause-scene">
          <div className="pause-line" />
          <div className="scene-copy centered compact">
            <span className="eyebrow">{s[5].kicker}</span>
            <h2>{s[5].title}</h2>
            <p>{s[5].note}</p>
          </div>
          <div className="pause-line" />
        </section>

        <section className="scene procession-scene">
          <div className="procession-image"><Photo src={p[5]} alt="Wedding couple outdoors" /></div>
          <div className="procession-copy scene-copy">
            <span className="eyebrow">{s[6].kicker}</span>
            <h2>{s[6].title}</h2>
            <p>{s[6].note}</p>
          </div>
        </section>

        <section className="scene afterdark-scene">
          <div className="afterdark-grid">
            <Photo src={p[2]} alt="Wedding couple under festive lights" />
            <div className="afterdark-copy scene-copy">
              <span className="eyebrow">{s[7].kicker}</span>
              <h2>{s[7].title}</h2>
              <p>{s[7].note}</p>
            </div>
            <Photo src={p[0]} alt="Indian wedding couple close portrait" />
          </div>
        </section>

        <section className="scene stilllife-scene">
          <div className="scene-copy narrow">
            <span className="eyebrow">{s[8].kicker}</span>
            <h2>{s[8].title}</h2>
            <p>{s[8].note}</p>
          </div>
          <div className="stilllife-cards">
            <div><span>01</span><b>Gold</b><i /></div>
            <div><span>02</span><b>Silk</b><i /></div>
            <div><span>03</span><b>Rain</b><i /></div>
            <div><span>04</span><b>Light</b><i /></div>
          </div>
        </section>

        <section className="scene promise-scene">
          <Photo src={p[7]} alt="Indian wedding couple portrait" className="promise-photo" />
          <div className="promise-mask" />
          <div className="scene-copy promise-copy centered">
            <span className="eyebrow">{s[9].kicker}</span>
            <h2>{s[9].title}</h2>
            <p>{s[9].note}</p>
          </div>
        </section>

        <section className="scene lastframe-scene">
          <div className="lastframe-image"><Photo src={p[1]} alt="Wedding portrait" /></div>
          <div className="lastframe-copy scene-copy">
            <span className="eyebrow">{s[10].kicker}</span>
            <h2>{s[10].title}</h2>
            <p>{s[10].note}</p>
            <span className="counter">11 / 12</span>
          </div>
        </section>

        <footer className="scene finale">
          <div className="finale-rain" aria-hidden="true" />
          <div className="scene-copy centered finale-copy">
            <span className="eyebrow">{s[11].kicker}</span>
            <h2>{s[11].title}</h2>
            <p>{s[11].note}</p>
            <div className="signature">{story.couple.first} <span>&</span> {story.couple.second}</div>
          </div>
          <div className="credits">Monsoon Vows · reusable wedding story template</div>
        </footer>
      </div>
    </main>
  )
}

export default App
