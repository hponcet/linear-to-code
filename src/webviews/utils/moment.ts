import moment from "moment"

// Imported instead of "moment" so only pages that format dates bundle it.
moment.updateLocale("en", {
  relativeTime: {
    future: "in %s",
    past: "%s ",
    s: "%ds ago",
    m: "%dmin ago",
    mm: "%dmin ago",
    h: "%dh ago",
    hh: "%dh ago",
    d: "%dd ago",
    dd: "%dd ago",
    M: "%dmo ago",
    MM: "%dmo ago",
    y: "%dy ago",
    yy: "%dy ago",
  },
})

export default moment
