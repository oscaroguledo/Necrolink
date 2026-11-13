# Sample Document for Link Extraction

This document contains various types of markdown links for testing the extractor.

## Inline Links

Here is [an inline link](https://example.com/page) to a page. This paragraph also
contains [another link](https://github.com/example/repo?utm_source=test&page=2) with
query parameters that should be normalized.

Check out [this research paper](https://arxiv.org/abs/2301.00001) published on 2023-01-15.

## Reference Links

This is [a reference link][ref1] that points to an external resource.

Here's another reference to [the same URL][ref1] appearing twice.

This paragraph mentions [MDN Web Docs][mdn] as a great resource, retrieved on 2023-06-20.

## Autolinks

Direct URL: <https://example.com/auto>

Another autolink: <https://www.wikipedia.org/wiki/Link_rot>

## Mixed Content

The Internet Archive (<https://archive.org>) is a digital library founded in 1996.
For more information, see [their about page](https://archive.org/about/) or the
[Wayback Machine documentation][wayback].

## Duplicate URLs

This link appears twice: [First occurrence](https://duplicate.example.com/page)

Same URL, different context: [Second occurrence](https://duplicate.example.com/page)

## Edge Cases

Link with HTTPS: [Secure Site](https://secure.example.com)

Link with HTTP: [Insecure Site](http://insecure.example.com)

Link with fragment: [Section Link](https://example.com/doc#section)

Link with special chars: [Query String](https://example.com/search?q=link+rot&sort=date)

## Reference Definitions

[ref1]: https://example.com/reference "Reference Title"
[mdn]: https://developer.mozilla.org/en-US/docs/Web
[wayback]: https://web.archive.org/web/ "Wayback Machine"
