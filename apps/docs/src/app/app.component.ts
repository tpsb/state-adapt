import { Location } from '@angular/common';
import { Component, Injector } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Event, NavigationEnd, Router, RouterEvent } from '@angular/router';
import asleepIcon from 'raw-loader!../assets/asleep.svg';
import awakeIcon from 'raw-loader!../assets/awake.svg';
import fadeIcon from 'raw-loader!../assets/fade.svg';
import githubIcon from 'raw-loader!../assets/github.svg';
import { Subject, interval, merge } from 'rxjs';
import { filter, map, startWith, take } from 'rxjs/operators';
import { getColorScheme, setColorScheme } from './set-color-scheme.function';

@Component({
  selector: 'sa-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  mobile = window.innerWidth < 800;
  sidenavExpanded = window.innerWidth > 800;

  githubIcon = this.sanitizer.bypassSecurityTrustHtml(githubIcon);

  asleepIcon = this.sanitizer.bypassSecurityTrustHtml(asleepIcon);
  awakeIcon = this.sanitizer.bypassSecurityTrustHtml(awakeIcon);
  fadeIcon = this.sanitizer.bypassSecurityTrustHtml(fadeIcon);
  setColorScheme = ((window as any).setColorScheme = setColorScheme);
  getColorScheme = ((window as any).getColorScheme = getColorScheme);

  urlChange$ = new Subject<string>();
  links$ = merge(
    this.urlChange$,
    this.router.events.pipe(
      filter((e: Event): e is RouterEvent => e instanceof RouterEvent),
      map(e => e.url),
    ),
  ).pipe(
    startWith(this.location.path()),
    map(url => [url, localStorage.getItem('framework')] as const),
    map(([url, framework]) => [
      {
        route: '/docs/core',
        name: '@state-adapt/core',
        active: url.startsWith('/docs/core'),
      },
      {
        route: '/adapters/core',
        name: '@state-adapt/core/adapters',
        active: url.startsWith('/adapters/core'),
      },
      {
        route: '/docs/rxjs',
        name: '@state-adapt/rxjs',
        active: url.startsWith('/docs/rxjs'),
      },
      {
        route: '/angular',
        name: 'Angular',
        expanded: framework === 'angular',
        children: [
          ['/get-started', 'Get Started'],
          ['/demos', 'Demos'],
          ['#1-start-with-simple-state', 'Tutorials'],
          ['/docs/angular', '@state-adapt/angular'],
          ['/docs/ngrx', '@state-adapt/ngrx'],
          ['/docs/ngxs', '@state-adapt/ngxs'],
        ].map(child => this.mapToChildRoute(url, '/angular', child)),
      },
      {
        route: '/react',
        name: 'React',
        expanded: framework === 'react',
        children: [
          ['/get-started', 'Get Started'],
          ['/demos', 'Demos'],
          ['#1-start-with-simple-state', 'Tutorials'],
          ['/docs/react', '@state-adapt/react'],
        ].map(child => this.mapToChildRoute(url, '/react', child)),
      },
      {
        route: '/svelte',
        name: 'Svelte',
        expanded: framework === 'svelte',
        children: [
          ['/get-started', 'Get Started'],
          ['/demos', 'Demos'],
          ['#1-start-with-simple-state', 'Tutorials'],
        ].map(child => this.mapToChildRoute(url, '/svelte', child)),
      },
      {
        route: '/solid-js',
        name: 'SolidJS',
        expanded: framework === 'solid-js',
        children: [
          ['/get-started', 'Get Started'],
          ['/demos', 'Demos'],
          ['#1-start-with-simple-state', 'Tutorials'],
        ].map(child => this.mapToChildRoute(url, '/solid-js', child)),
      },
      // {
      //   route: '/concepts',
      //   name: 'Concepts',
      //   expanded: true,
      //   children: [
      //     ['overview', 'Overview'],
      //     ['sources', 'Sources'],
      //     ['adapters', 'Adapters'],
      //     ['stores', 'Stores'],
      //     ['thinking-reactively', 'Thinking Reactively'],
      //   ].map(child => this.mapToChildRoute(url, '/concepts/', child)),
      // },
      // {
      //   route: '/adapters',
      //   name: 'Adapters',
      //   expanded: true,
      //   children: [['core', 'Core']].map(child =>
      //     this.mapToChildRoute(url, '/adapters/', child),
      //   ),
      // },
    ]),
  );

  private mapToChildRoute(
    url: string,
    baseUrl: string,
    [childUrl, childName]: string[],
  ) {
    const route = baseUrl + childUrl;
    const [path, fragment] = route.split('#');
    const [urlPath] = url.split('#');
    return {
      route: path,
      active: urlPath === route,
      name: childName,
      fragment,
    };
  }

  constructor(
    private location: Location,
    private router: Router,
    private injector: Injector,
    private sanitizer: DomSanitizer,
  ) {
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd && e.url) {
        // Check for a hash in either the URL or the localStorage
        // and wait for the element to be rendered before navigating to it.
        const [, fragment] = e.url.split('#');
        if (fragment) {
          interval(100)
            .pipe(
              take(10),
              map(() => document.getElementById(fragment)),
              filter(el => !!el),
              take(1),
            )
            .subscribe(el => el?.scrollIntoView());
        }
      }
    });

    // GitHub pages hack
    // Links to other routes go to the 404 page, which sets 'url' in localStorage
    // Access 'url' here and navigate to it
    // If AppComponent is being constructed and there's already a URL, then this is
    // local development.
    const url = localStorage.getItem('url');
    const [path, fragment] = url?.split('#') || [
      undefined,
      window.location.hash.slice(1),
    ];

    if (path) {
      localStorage.removeItem('url');
      this.router.navigate([path], { fragment });
    }

    (window as any).document.addEventListener(
      'routeTo',
      (e: CustomEvent) => {
        e.preventDefault();
        router.navigateByUrl(e.detail);
      },
      false,
    );

    // https://github.com/ngstack/code-editor/issues/628
    import('./adapters/adapters-core.component').then(m =>
      this.injector
        .get(m.CodeEditorService)
        .loadEditor()
        .then(() => this.injector.get(m.EditorReadyService).ready$.next(true)),
    );
  }

  navigate(e: any) {
    setTimeout(() => this.urlChange$.next(this.location.path()));
  }

  trackByRoute(id: number, item: { route: string }) {
    return item.route;
  }
}
