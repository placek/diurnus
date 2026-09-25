// WYGENEROWANE z listy ICONS w model.ts + ikon interfejsu.
// Każda ikona to osobny moduł, więc bundler wciąga wyłącznie te path-e —
// zamiast całej biblioteki z CDN-u, jak robił to prototyp.
import { faGithub } from '@fortawesome/free-brands-svg-icons/faGithub';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp';
import { faBed } from '@fortawesome/free-solid-svg-icons/faBed';
import { faBicycle } from '@fortawesome/free-solid-svg-icons/faBicycle';
import { faBookBible } from '@fortawesome/free-solid-svg-icons/faBookBible';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons/faBookOpen';
import { faBrain } from '@fortawesome/free-solid-svg-icons/faBrain';
import { faBriefcase } from '@fortawesome/free-solid-svg-icons/faBriefcase';
import { faBroom } from '@fortawesome/free-solid-svg-icons/faBroom';
import { faCar } from '@fortawesome/free-solid-svg-icons/faCar';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons/faCartShopping';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faChild } from '@fortawesome/free-solid-svg-icons/faChild';
import { faChurch } from '@fortawesome/free-solid-svg-icons/faChurch';
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle';
import { faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons/faCircleHalfStroke';
import { faCode } from '@fortawesome/free-solid-svg-icons/faCode';
import { faCross } from '@fortawesome/free-solid-svg-icons/faCross';
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload';
import { faDumbbell } from '@fortawesome/free-solid-svg-icons/faDumbbell';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons/faEnvelope';
import { faFilm } from '@fortawesome/free-solid-svg-icons/faFilm';
import { faGamepad } from '@fortawesome/free-solid-svg-icons/faGamepad';
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons/faGraduationCap';
import { faGuitar } from '@fortawesome/free-solid-svg-icons/faGuitar';
import { faHammer } from '@fortawesome/free-solid-svg-icons/faHammer';
import { faHandsPraying } from '@fortawesome/free-solid-svg-icons/faHandsPraying';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse';
import { faLaptopCode } from '@fortawesome/free-solid-svg-icons/faLaptopCode';
import { faLayerGroup } from '@fortawesome/free-solid-svg-icons/faLayerGroup';
import { faListCheck } from '@fortawesome/free-solid-svg-icons/faListCheck';
import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon';
import { faMountain } from '@fortawesome/free-solid-svg-icons/faMountain';
import { faMugHot } from '@fortawesome/free-solid-svg-icons/faMugHot';
import { faMusic } from '@fortawesome/free-solid-svg-icons/faMusic';
import { faPenNib } from '@fortawesome/free-solid-svg-icons/faPenNib';
import { faPersonRunning } from '@fortawesome/free-solid-svg-icons/faPersonRunning';
import { faPhone } from '@fortawesome/free-solid-svg-icons/faPhone';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faQuestion } from '@fortawesome/free-solid-svg-icons/faQuestion';
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons/faRotateLeft';
import { faSeedling } from '@fortawesome/free-solid-svg-icons/faSeedling';
import { faStar } from '@fortawesome/free-solid-svg-icons/faStar';
import { faSun } from '@fortawesome/free-solid-svg-icons/faSun';
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells';
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan';
import { faUpload } from '@fortawesome/free-solid-svg-icons/faUpload';
import { faUsers } from '@fortawesome/free-solid-svg-icons/faUsers';
import { faUtensils } from '@fortawesome/free-solid-svg-icons/faUtensils';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';

import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

const DEFS: IconDefinition[] = [faArrowUp, faBed, faBicycle, faBookBible, faBookOpen, faBrain, faBriefcase, faBroom, faCar, faCartShopping, faCheck, faChild, faChurch, faCircle, faCircleHalfStroke, faCode, faCross, faDownload, faDumbbell, faEnvelope, faFilm, faGamepad, faGear, faGithub, faGraduationCap, faGuitar, faHammer, faHandsPraying, faHeart, faHouse, faLaptopCode, faLayerGroup, faListCheck, faMoon, faMountain, faMugHot, faMusic, faPenNib, faPersonRunning, faPhone, faPlus, faQuestion, faRotateLeft, faSeedling, faStar, faSun, faTableCells, faTrashCan, faUpload, faUsers, faUtensils, faXmark];

/** nazwa kebab-case → [szerokość, wysokość, ścieżka SVG] */
export const ICON_PATHS: Record<string, [number, number, string]> = Object.fromEntries(
  DEFS.map((d) => [d.iconName, [d.icon[0], d.icon[1], d.icon[4] as string]]),
);
