/** A presentation asset prepared from the user's supplied mascot reference. */
export default function BrandCharacters({
  focus = "group",
  className = "",
  label = "",
}) {
  return (
    <span
      className={`brand-characters ${focus === "group" ? "cast-group" : `cast-character cast-${focus}`} ${className}`}
      aria-hidden={label ? undefined : true}
    >
      <img
        src={
          focus === "guide"
            ? "/brand/woori-guide.png"
            : "/brand/woori-mascots.png"
        }
        alt={label}
        draggable="false"
        decoding="async"
      />
    </span>
  );
}
