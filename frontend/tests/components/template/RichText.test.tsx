import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RichText from "@components/template/RichText/RichText";

describe("RichText", () => {
  it("renders quill markup as formatted html", () => {
    const { container } = render(
      <RichText html='<p>Watching&nbsp;the&nbsp;aliens&nbsp;from&nbsp;<strong>below</strong>!</p><ul><li><span style="font-size: 24px;">one</span></li></ul>' />,
    );

    expect(screen.getByText("below").tagName).toBe("STRONG");
    expect(container.querySelectorAll("ul > li")).toHaveLength(1);
    expect(screen.getByText("one")).toHaveStyle({ fontSize: "24px" });
    expect(container.querySelector("p")?.textContent).toBe("Watching the aliens from below!");
  });

  it("keeps line breaks typed in the text but not the ones between blocks", () => {
    const { container } = render(<RichText html={'<p>first</p>\n  <ul>\n    <li>bullet</li>\n  </ul>\n<p>line\nbreak</p>'} />);

    expect(container.querySelector(".rich-text")?.innerHTML).toBe(
      "<p>first</p><ul><li>bullet</li></ul><p>line\nbreak</p>",
    );
  });

  it("keeps safe links and opens them in a new tab", () => {
    render(<RichText html='<p><a href="https://example.com/docs">tickets</a></p>' />);

    const link = screen.getByRole("link", { name: "tickets" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("drops elements, attributes and link protocols that are not allowed", () => {
    const { container } = render(
      <RichText html='<p onclick="steal()">safe<img src="x" onerror="steal()"></p><script>steal()</script><a href="javascript:steal()">tap</a><span style="font-size: 24px; position: fixed">sized</span>' />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")).not.toHaveAttribute("onclick");
    expect(container.querySelector("a")).not.toHaveAttribute("href");
    expect(container.querySelector("span")).toHaveAttribute("style", "font-size: 24px");
  });
});
